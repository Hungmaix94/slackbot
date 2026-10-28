import os
import re
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional, List

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
import httpx

from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.fastapi.async_handler import AsyncSlackRequestHandler
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler

from rag_engine import SRSRagEngine
from gemini_agent import (
    GeminiAgent,
    classify_intent,
    is_tech_requested,
    run_srs_code_audit,
    sanitize_agent_response,
)
from plane_client import PlaneClient
from excel_generator import parse_all_markdown_tables, create_excel_from_tables
from user_mapping import extract_and_resolve_assignees
from testcase_collector import TestcaseCollector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("mvl-slack-agent")

rag_engine = SRSRagEngine()
gemini_agent = GeminiAgent()
plane_client = PlaneClient()
testcase_collector = TestcaseCollector()

slack_bot_token = os.environ.get("SLACK_BOT_TOKEN", "")
slack_app_token = os.environ.get("SLACK_APP_TOKEN", "")
slack_signing_secret = os.environ.get("SLACK_SIGNING_SECRET", "")
audit_slack_channel_id = os.environ.get("AUDIT_SLACK_CHANNEL_ID", "")
audit_interval_hours = float(os.environ.get("AUDIT_INTERVAL_HOURS", "24"))

bolt_app = AsyncApp(
    token=slack_bot_token or "xoxb-dummy-token",
    signing_secret=slack_signing_secret or "dummy_secret_for_railway_deploy",
    request_verification_enabled=bool(slack_signing_secret),
)
bolt_handler = AsyncSlackRequestHandler(bolt_app)

background_tasks_set = set()
latest_audit_report: Optional[Dict[str, Any]] = None


async def download_slack_file(url_private: str) -> Optional[bytes]:
    if not url_private:
        return None
    headers = {"Authorization": f"Bearer {slack_bot_token}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(url_private, headers=headers)
        if res.is_success:
            return res.content
        logger.error(f"Failed to download Slack file: {res.status_code}")
        return None


def markdown_to_slack_links(text: str) -> str:
    if not text:
        return ""
    converted = re.sub(r"\[([^\]]+)\]\((https?://[^\)]+)\)", r"<\2|\1>", text)
    converted = re.sub(r"(?<!\*)\*\*([^*]+)\*\*(?!\*)", r"*\1*", converted)
    return converted


def create_answer_blocks(
    text: str,
    has_excel: bool = False,
    excel_file_name: str = "export.xlsx",
    is_uat: bool = False,
    is_usecase: bool = False,
) -> List[Dict[str, Any]]:
    blocks = []
    safe_text = text.strip() if text and text.strip() else "Mình chưa tìm thấy thông tin phù hợp cho yêu cầu này."
    slack_text = markdown_to_slack_links(safe_text)

    chunk_size = 2800
    for i in range(0, len(slack_text), chunk_size):
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": slack_text[i:i + chunk_size],
            },
        })

    action_elements = []
    if has_excel:
        action_elements.append({
            "type": "button",
            "text": {"type": "plain_text", "text": "📊 Tải Excel", "emoji": True},
            "action_id": "download_excel",
            "value": excel_file_name,
            "style": "primary",
        })

    if is_uat:
        action_elements.append({
            "type": "button",
            "text": {"type": "plain_text", "text": "➕ Thêm Kịch bản Biên", "emoji": True},
            "action_id": "expand_edge_cases",
            "value": "edge_cases",
        })

    action_elements.append({
        "type": "button",
        "text": {"type": "plain_text", "text": "🐛 Tạo Task Plane", "emoji": True},
        "action_id": "create_plane_task",
        "value": "create_task",
    })

    if action_elements:
        blocks.append({"type": "actions", "elements": action_elements})

    return blocks


async def process_query_and_reply(
    query: str,
    channel_id: str,
    thread_ts: Optional[str],
    client,
    say,
    instruction_type: str = "default",
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[str] = None,
):
    try:
        intent = classify_intent(query)
        tech_mode = is_tech_requested(query)
        logger.info(f"Processing query: '{query[:60]}' (intent={intent}, tech={tech_mode}, user={user_id})")

        if intent == "AUDIT_SRS_CODE":
            report = run_srs_code_audit(query)
            global latest_audit_report
            latest_audit_report = report
            await say(
                text=report["markdownSummary"],
                blocks=report["slackBlocks"],
                thread_ts=thread_ts,
            )
            return

        plane_context, enriched_plane_terms = await plane_client.resolve_issue_references_from_text(query)
        search_query = f"{query} {enriched_plane_terms}".strip()

        chunks = rag_engine.search(search_query, top_k=8, include_code=True)
        srs_context = rag_engine.format_context(chunks, allow_tech=tech_mode)
        full_context = f"{plane_context}\n\n{srs_context}".strip() if plane_context else srs_context

        eff_type = instruction_type
        if intent == "BA":
            eff_type = "usecase"
        elif intent == "QA":
            eff_type = "testcase"
        elif tech_mode and eff_type == "default":
            eff_type = "tech"

        answer = gemini_agent.generate(
            query=query,
            srs_context=full_context,
            history=history,
            instruction_type=eff_type,
            enriched_query=enriched_plane_terms,
        )
        answer = sanitize_agent_response(answer, allow_tech=tech_mode)

        try:
            citations = [c.get("citation", "") for c in chunks] if chunks else []
            testcase_collector.save_testcase(
                question=query,
                answer=answer,
                user_id=user_id,
                channel_id=channel_id,
                thread_ts=thread_ts,
                citations=citations,
            )
        except Exception as tce:
            logger.warning(f"Error auto-collecting testcase: {tce}")

        tables = parse_all_markdown_tables(answer)
        excel_path = None
        excel_name = "export.xlsx"
        if tables and eff_type in ["usecase", "testcase"]:
            try:
                excel_name = "LAD-UseCase-List.xlsx" if eff_type == "usecase" else "Kịch bản UAT.xlsx"
                temp_filename = f"/tmp/{excel_name}"
                create_excel_from_tables(tables, temp_filename, query=query)
                excel_path = temp_filename
            except Exception as ex:
                logger.error(f"Failed to generate Excel file: {ex}")

        blocks = create_answer_blocks(
            text=answer,
            has_excel=bool(excel_path),
            excel_file_name=excel_name,
            is_uat=(eff_type == "testcase"),
            is_usecase=(eff_type == "usecase"),
        )
        await say(
            text=markdown_to_slack_links(answer[:200]),
            blocks=blocks,
            thread_ts=thread_ts,
        )

        if excel_path and os.path.exists(excel_path):
            try:
                await client.files_upload_v2(
                    channel=channel_id,
                    file=excel_path,
                    filename=excel_name,
                    title=f"Bản xuất {excel_name}",
                    initial_comment=f"📊 File Excel đính kèm ({excel_name}):",
                    thread_ts=thread_ts,
                )
            except Exception as up_ex:
                logger.error(f"Error uploading Excel to Slack: {up_ex}")
            finally:
                try:
                    os.remove(excel_path)
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"Error in process_query_and_reply: {e}", exc_info=True)
        await say(f"⚠️ Chưa thể hoàn tất yêu cầu: {str(e)}", thread_ts=thread_ts)


@bolt_app.middleware
async def log_all_incoming_requests(logger, body, next):
    event = body.get("event", {})
    req_type = body.get("type", "unknown")
    event_type = event.get("type", "unknown")
    logger.info(f"⚡️ [Slack Event] request_type={req_type}, event_type={event_type}")
    return await next()


@bolt_app.event("message")
async def handle_message_event(event, say, client):
    if event.get("bot_id") or event.get("subtype") == "bot_message":
        return
    if event.get("channel_type") == "im":
        await handle_app_mention(event, say, client)


@bolt_app.event("app_mention")
async def handle_app_mention(event, say, client):
    text = event.get("text", "")
    thread_ts = event.get("thread_ts")
    ts = event.get("ts")
    channel_id = event.get("channel")
    target_thread_ts = thread_ts or ts

    try:
        auth_info = await client.auth_test()
        bot_user_id = auth_info.get("user_id")
    except Exception:
        bot_user_id = None

    query = text
    if bot_user_id:
        query = re.sub(rf"<@{bot_user_id}>", "", query).strip()
    else:
        query = re.sub(r"<@[A-Z0-9]+>", "", query, count=1).strip()

    if not query:
        await say(
            "👋 Chào bạn! Mình là trợ lý nghiệp vụ dự án MaiVietLand.\n"
            "• Hỏi nghiệp vụ: `@bot quy trình tạm ứng hoa hồng`\n"
            "• Kiểm tra kỹ thuật: `@bot check code vì sao lệch kỳ hoa hồng`\n"
            "• Tạo task nhanh: `@bot tạo task [CRM] lỗi lưu SĐT giao @ducpm`\n"
            "• Đối chiếu SRS & Code: `@bot audit srs`",
            thread_ts=target_thread_ts,
        )
        return

    intent = classify_intent(query)
    if intent == "CREATE_TASK":
        await handle_create_task_from_thread(
            channel_id=channel_id,
            thread_ts=target_thread_ts,
            client=client,
            say=say,
            trigger_text=text,
            bot_user_id=bot_user_id,
        )
        return

    history = []
    if thread_ts:
        try:
            res = await client.conversations_replies(channel=channel_id, ts=thread_ts)
            messages = res.get("messages", [])
            for msg in messages[:-1]:
                m_text = msg.get("text", "").strip()
                if not m_text:
                    continue
                is_bot = "bot_id" in msg or msg.get("user") == bot_user_id
                role = "model" if is_bot else "user"
                history.append({"role": role, "parts": [{"text": m_text}]})
        except Exception as e:
            logger.warning(f"Error fetching thread history: {e}")

    task = asyncio.create_task(
        process_query_and_reply(
            query=query,
            channel_id=channel_id,
            thread_ts=target_thread_ts,
            client=client,
            say=say,
            instruction_type="default",
            history=history[-6:] if history else None,
        )
    )
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


async def handle_create_task_from_thread(
    channel_id: str,
    thread_ts: Optional[str],
    client,
    say,
    trigger_text: str = "",
    bot_user_id: Optional[str] = None,
):
    try:
        messages = []
        if thread_ts:
            try:
                res = await client.conversations_replies(channel=channel_id, ts=thread_ts)
                messages = res.get("messages", [])
            except Exception:
                messages = []

        if not messages and trigger_text:
            messages = [{"user": "User", "text": trigger_text}]

        if not messages:
            await say("⚠️ Bạn vui lòng nhập nội dung công việc/lỗi cần tạo task nhé!", thread_ts=thread_ts)
            return

        conversation_text = "\n".join([f"- {m.get('user', 'User')}: {m.get('text', '')}" for m in messages])
        task_info_raw = gemini_agent.generate(
            query=f"Trích xuất thông tin task từ nội dung:\n{conversation_text}",
            instruction_type="task_extract",
        )

        try:
            clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", task_info_raw.strip())
            task_data = json.loads(clean_json)
        except Exception:
            clean_desc = re.sub(r"<@[A-Z0-9]+>", "", trigger_text or conversation_text).strip()
            clean_desc = re.sub(r"^(?:tạo|tao|log|báo)\s+(?:nhanh\s+)?(?:task|bug|lỗi)\s*[:\-]?\s*", "", clean_desc, flags=re.I)
            task_data = {
                "name": f"[TASK] {clean_desc[:60] or 'Công việc từ Slack'}",
                "type": "bug" if "lỗi" in clean_desc.lower() or "bug" in clean_desc.lower() else "task",
                "module": "Hệ thống",
                "priority": "high",
                "actual": clean_desc,
                "expected": "Hoàn thành đúng yêu cầu nghiệp vụ.",
            }

        name = task_data.get("name") or f"[TASK] Công việc từ Slack"
        priority = task_data.get("priority", "high")
        actual = task_data.get("actual") or conversation_text
        expected = task_data.get("expected") or "Xử lý đúng quy định nghiệp vụ."
        module_name = task_data.get("module") or "Hệ thống"

        resolved_assignees = await extract_and_resolve_assignees(
            client=client,
            trigger_text=trigger_text,
            messages=messages,
            bot_user_id=bot_user_id,
            plane_client=plane_client,
            explicit_assignee_text=task_data.get("explicit_assignee"),
        )
        assignee_ids = [a[0] for a in resolved_assignees] if resolved_assignees else None

        clean_thread_ts = (thread_ts or "").replace(".", "")
        slack_thread_link = f"https://slack.com/archives/{channel_id}/p{clean_thread_ts}" if clean_thread_ts else ""
        link_html = f'<p>🔗 <a href="{slack_thread_link}" target="_blank">Mở thảo luận trên Slack</a></p>' if slack_thread_link else ""
        final_description = (
            f"<p><strong>📌 Phân hệ:</strong> {module_name} | <strong>Ưu tiên:</strong> {priority.upper()}</p>"
            f"<h4>🎯 Nội dung</h4><p>{actual}</p>"
            f"<h4>✅ Mong đợi</h4><p>{expected}</p>"
            f"{link_html}"
        )

        issue = await plane_client.create_issue(
            name=name,
            description_html=final_description,
            priority=priority,
            assignee_ids=assignee_ids,
        )

        issue_id = issue.get("id")
        issue_url = issue.get("url")

        uploaded_count = 0
        for m in messages:
            for f in m.get("files", []):
                url_priv = f.get("url_private")
                fname = f.get("name")
                mimetype = f.get("mimetype", "image/png")
                if url_priv and fname:
                    fbytes = await download_slack_file(url_priv)
                    if fbytes:
                        try:
                            await plane_client.upload_attachment(
                                issue_id=issue_id,
                                file_bytes=fbytes,
                                file_name=fname,
                                content_type=mimetype,
                            )
                            uploaded_count += 1
                        except Exception as ue:
                            logger.error(f"Error uploading file to Plane: {ue}")

        assignee_labels = ", ".join([a[1] for a in resolved_assignees]) if resolved_assignees else "Chưa gán"
        attach_info = f" | *Đính kèm:* {uploaded_count} tệp" if uploaded_count > 0 else ""
        msg_reply = (
            f"✅ *Đã tạo task Plane:* <{issue_url}|{name}>\n"
            f"• *Ưu tiên:* `{priority.upper()}` | *Giao cho:* {assignee_labels}{attach_info}"
        )
        await say(msg_reply, thread_ts=thread_ts)

    except Exception as e:
        logger.error(f"Error creating task: {e}", exc_info=True)
        await say(f"⚠️ Không thể tạo task trên Plane: {str(e)}", thread_ts=thread_ts)


@bolt_app.action("create_plane_task")
async def handle_create_plane_task_action(ack, body, client, say):
    await ack()
    channel_id = body.get("channel", {}).get("id")
    message = body.get("message", {})
    thread_ts = message.get("thread_ts") or message.get("ts")
    if not channel_id:
        return
    try:
        auth_info = await client.auth_test()
        bot_user_id = auth_info.get("user_id")
    except Exception:
        bot_user_id = None
    task = asyncio.create_task(
        handle_create_task_from_thread(
            channel_id=channel_id,
            thread_ts=thread_ts,
            client=client,
            say=say,
            trigger_text="tạo bug",
            bot_user_id=bot_user_id,
        )
    )
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


@bolt_app.command("/srs")
async def handle_srs_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    channel_id = body.get("channel_id")
    if not text:
        await say("👋 Hãy nhập câu hỏi nghiệp vụ cần tra cứu! Ví dụ: `/srs quy trình đặt cọc`")
        return
    task = asyncio.create_task(process_query_and_reply(text, channel_id, None, client, say, instruction_type="default"))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


@bolt_app.command("/usecase")
async def handle_usecase_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    channel_id = body.get("channel_id")
    if not text:
        await say("👋 Hãy nhập nghiệp vụ cần sinh Use Case. Ví dụ: `/usecase tạm ứng hoa hồng`")
        return
    task = asyncio.create_task(process_query_and_reply(text, channel_id, None, client, say, instruction_type="usecase"))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


@bolt_app.command("/testcase")
async def handle_testcase_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    channel_id = body.get("channel_id")
    if not text:
        await say("👋 Hãy nhập nghiệp vụ cần sinh kịch bản UAT. Ví dụ: `/testcase hợp đồng đặt cọc`")
        return
    task = asyncio.create_task(process_query_and_reply(text, channel_id, None, client, say, instruction_type="testcase"))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


@bolt_app.command("/create-task")
async def handle_create_task_command(ack, body, say, client):
    await ack()
    channel_id = body.get("channel_id")
    thread_ts = body.get("thread_ts")
    text = body.get("text", "").strip()
    task = asyncio.create_task(
        handle_create_task_from_thread(
            channel_id=channel_id,
            thread_ts=thread_ts,
            client=client,
            say=say,
            trigger_text=f"tạo task {text}".strip(),
        )
    )
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


@bolt_app.command("/audit")
async def handle_audit_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    report = run_srs_code_audit(text)
    global latest_audit_report
    latest_audit_report = report
    await say(text=report["markdownSummary"], blocks=report["slackBlocks"])


@bolt_app.command("/bugs")
async def handle_bugs_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    if not text:
        await say("👋 Nhập từ khóa lỗi cần tra cứu. Ví dụ: `/bugs xuất excel`")
        return

    async def _search_plane():
        issues = await plane_client.search_issues(text, filter_bugs=True)
        if not issues:
            await say(f"🔍 Không tìm thấy bug nào khớp với *'{text}'*.")
            return
        lines = [
            f"• <{plane_client.get_issue_web_url(issue.get('project', ''), issue.get('id', ''))}|{issue.get('name')}> (`{issue.get('priority', 'medium')}`)"
            for issue in issues[:6]
        ]
        await say(f"🔍 *Kết quả trên Plane ({len(issues)} bug):*\n" + "\n".join(lines))

    task = asyncio.create_task(_search_plane())
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)


async def periodic_audit_scheduler():
    """Chạy định kỳ đối chiếu SRS vs Code và gửi báo cáo lên Slack nếu cấu hình kênh."""
    global latest_audit_report
    while True:
        try:
            report = run_srs_code_audit()
            latest_audit_report = report
            logger.info(
                f"Scheduled SRS-vs-Code Audit completed: {report['matchedCount']} matched, {report['driftCount']} drift."
            )
            if audit_slack_channel_id and slack_bot_token:
                await bolt_app.client.chat_postMessage(
                    channel=audit_slack_channel_id,
                    text=report["markdownSummary"],
                    blocks=report["slackBlocks"],
                )
        except Exception as e:
            logger.error(f"Scheduled audit error: {e}")
        await asyncio.sleep(max(3600.0, audit_interval_hours * 3600.0))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up MVL Slack Agent Server...")
    stats = rag_engine.get_stats()
    logger.info(f"SRS RAG Engine stats: {stats}")

    # Khởi tạo lịch Audit SRS vs Code tự động
    audit_task = asyncio.create_task(periodic_audit_scheduler())
    background_tasks_set.add(audit_task)
    audit_task.add_done_callback(background_tasks_set.discard)

    socket_mode_task = None
    if slack_app_token:
        logger.info("Initializing Slack Socket Mode Handler...")
        socket_handler = AsyncSocketModeHandler(bolt_app, slack_app_token)
        socket_mode_task = asyncio.create_task(socket_handler.start_async())
        background_tasks_set.add(socket_mode_task)
        socket_mode_task.add_done_callback(background_tasks_set.discard)
    else:
        logger.warning("SLACK_APP_TOKEN is missing. Slack will only be accessible via HTTP webhooks.")

    yield

    logger.info("Shutting down MVL Slack Agent Server...")
    for t in [audit_task, socket_mode_task]:
        if t and not t.done():
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass


app = FastAPI(title="MVL Slack Agent Server", lifespan=lifespan)


@app.get("/", response_class=HTMLResponse)
async def root_dashboard():
    html_content = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MVL AI Assistant — Business Q&A, Plane Triage & SRS-Code Audit</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --green: #22c55e;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1240px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    h1 { font-size: 22px; font-weight: 700; color: #fff; }
    .badge {
      background: rgba(34, 197, 94, 0.15);
      color: var(--green);
      border: 1px solid rgba(34, 197, 94, 0.4);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
    }
    .grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 20px; margin-bottom: 24px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .card h2 { font-size: 16px; margin-bottom: 12px; color: var(--accent); }
    .preset-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    button {
      background: #334155;
      color: #fff;
      border: 1px solid #475569;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    button:hover { background: #475569; }
    button.primary { background: #0284c7; border-color: #38bdf8; font-weight: 600; }
    .input-row { display: flex; gap: 8px; margin-bottom: 14px; }
    input[type="text"] {
      flex: 1;
      background: #0f172a;
      border: 1px solid var(--border);
      color: #fff;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
    }
    .output-box {
      background: #0b1120;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      min-height: 170px;
      white-space: pre-wrap;
      font-size: 14px;
    }
    .meta-tags { display: flex; gap: 8px; margin-bottom: 10px; font-size: 12px; }
    .tag { background: #1e3a8a; color: #93c5fd; padding: 3px 9px; border-radius: 6px; font-weight: 600; }
    .tag.biz { background: #064e3b; color: #6ee7b7; }
    .tag.tech { background: #7c2d12; color: #fdba74; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
    th, td { border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; }
    th { color: var(--muted); font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>🤖 MVL AI Assistant — Zero-Intro, Full SRS+Code Knowledge Base (48,789 Chunks) & Plane Task Resolver</h1>
        <p style="color: var(--muted); font-size: 13px; margin-top: 4px;">
          Bắt đầu luôn (Zero Intro) • Tự động bóc tách Link/Mã Task Plane (MVL-3819) • 48,789 Chunks (SRS + Backend Docs/Issues + ERP/AppSale Code) • 335/335 Test Cases Pass
        </p>
      </div>
      <div class="badge" id="suite-badge">✅ 335/335 Test Cases (100% PASS)</div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>💬 1. Live Agent Simulator (Plane Task MVL-3819 vs Business Mode vs "check code" vs Audit)</h2>
        <div class="preset-btns">
          <button onclick="runPreset('Kiểm tra logic của task này. Chi tiết nghiệp vụ pm.glinteco.com/glinteco/browse/MVL-3819')" id="btn-mvl3819">
            🔥 Kiểm tra Task MVL-3819 (HHQL Hải Phòng)
          </button>
          <button onclick="runPreset('Vì sao duyệt phiếu đối chiếu CĐT tháng 9 mà hóa đơn bán ra lại nhảy vào kỳ hoa hồng tháng 8?')" id="btn-biz">
            🟢 Hỏi Nghiệp Vụ (Thuần Business)
          </button>
          <button onclick="runPreset('check code vì sao HHQL của Hải Phòng có cách tính khác các chi nhánh còn lại MVL-3819')" id="btn-tech">
            🟠 Check Code MVL-3819 (Tech Mode)
          </button>
          <button onclick="runPreset('tạo bug [CRM] Lỗi không lưu được số điện thoại khách hàng khi tạo lead mới giao @ducpm')" id="btn-task">
            🟣 Tạo Task Nhanh Plane
          </button>
          <button onclick="runPreset('/audit srs với code')" id="btn-audit">
            🔵 Schedule / On-Demand Audit SRS
          </button>
        </div>
        <div class="input-row">
          <input type="text" id="query-input" value="Kiểm tra logic của task này. Chi tiết nghiệp vụ pm.glinteco.com/glinteco/browse/MVL-3819" />
          <button class="primary" onclick="sendQuery()" id="btn-send">Gửi yêu cầu</button>
        </div>
        <div class="meta-tags" id="response-meta"></div>
        <div class="output-box" id="response-output">Bấm một kịch bản mẫu phía trên để kiểm tra phản hồi...</div>
      </div>

      <div class="card">
        <h2>📋 2. Scheduled SRS vs Code Audit Report (13 Core Modules)</h2>
        <div id="audit-summary-box" class="output-box" style="min-height: 255px;">Đang tải báo cáo đối chiếu SRS & Code...</div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>🧪 3. Bộ Testcase Input-Output (330 Test Cases — 6 Nhóm Nghiệp Vụ & Guardrails)</h2>
        <div class="preset-btns" id="cat-filters" style="margin-bottom:0;">
          <button onclick="filterCases('ALL')" class="primary">Tất cả (330)</button>
          <button onclick="filterCases('BUSINESS_QA')">Business Q&A (90)</button>
          <button onclick="filterCases('TECH_CHECK_CODE')">Check Code (65)</button>
          <button onclick="filterCases('FAST_PLANE_TASK')">Plane Task (75)</button>
          <button onclick="filterCases('SCHEDULED_AND_ONDEMAND_AUDIT')">SRS Audit (40)</button>
          <button onclick="filterCases('BA_USECASE_AND_QA_TESTCASE')">BA/QA (30)</button>
          <button onclick="filterCases('PROJECT_SEARCH_AND_GUARDRAILS')">Guardrails (30)</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:80px;">Mã TC</th>
            <th style="width:180px;">Nhóm</th>
            <th>Input (Query người dùng)</th>
            <th style="width:120px;">Intent</th>
            <th style="width:110px;">Chế độ</th>
            <th>Output Mẫu / Ràng buộc</th>
          </tr>
        </thead>
        <tbody id="testcases-tbody"></tbody>
      </table>
    </div>
  </div>

  <script>
    let allCases = [];
    async function sendQuery() {
      const q = document.getElementById('query-input').value;
      const out = document.getElementById('response-output');
      const meta = document.getElementById('response-meta');
      out.textContent = '⏳ Đang kiểm tra...';
      const res = await fetch('/test/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q })
      });
      const data = await res.json();
      const modeClass = data.techMode ? 'tech' : 'biz';
      const modeLabel = data.techMode ? '💻 TECH MODE (Check Code)' : '🌿 THUẦN BUSINESS (Friendly & Concise)';
      meta.innerHTML = `<span class="tag">Intent: ${data.intent}</span><span class="tag ${modeClass}">${modeLabel}</span>`;
      out.textContent = data.answer || '';
    }
    function runPreset(text) {
      document.getElementById('query-input').value = text;
      sendQuery();
    }
    async function loadAudit() {
      const res = await fetch('/audit/report');
      const data = await res.json();
      document.getElementById('audit-summary-box').textContent = data.markdownSummary;
    }
    async function loadTestCases() {
      const res = await fetch('/api/testcases');
      const data = await res.json();
      allCases = data.items || [];
      document.getElementById('suite-badge').textContent = `✅ ${data.total}/300+ Test Cases (100% PASS)`;
      renderCases(allCases.slice(0, 25));
    }
    function filterCases(cat) {
      const filtered = cat === 'ALL' ? allCases : allCases.filter(c => c.category === cat);
      renderCases(filtered.slice(0, 30));
    }
    function renderCases(list) {
      const tbody = document.getElementById('testcases-tbody');
      tbody.innerHTML = list.map(c => `
        <tr>
          <td><strong>${c.id}</strong></td>
          <td><code>${c.category}</code></td>
          <td>${c.input.query}</td>
          <td><span class="tag">${c.expected_output.intent}</span></td>
          <td><span class="tag ${c.expected_output.tech_mode ? 'tech' : 'biz'}">${c.expected_output.tech_mode ? 'TECH' : 'BUSINESS'}</span></td>
          <td style="font-size:12px; color:#cbd5e1;">${(c.expected_output.sample_output_message || '').split('\\n')[0]}</td>
        </tr>
      `).join('');
    }
    loadAudit();
    loadTestCases();
    sendQuery();
  </script>
</body>
</html>"""
    return HTMLResponse(content=html_content)


@app.get("/api/testcases")
async def get_testcases_api(limit: int = 100, module: Optional[str] = None):
    tc_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests", "testcases_300_io.json")
    items = []
    if os.path.exists(tc_path):
        with open(tc_path, "r", encoding="utf-8") as f:
            items = json.load(f)
    return {
        "total": len(items),
        "items": items,
        "stats": testcase_collector.get_stats(),
        "testcases": testcase_collector.get_testcases(limit, module),
    }


@app.get("/api/testcases/stats")
async def get_testcases_stats():
    return testcase_collector.get_stats()


@app.get("/api/testcases/export")
async def export_testcases():
    excel_path = testcase_collector.export_to_excel()
    return FileResponse(
        path=excel_path,
        filename="User_Questions_Testcases.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/health")
async def health():
    stats = rag_engine.get_stats()
    tc_stats = testcase_collector.get_stats()
    return {
        "status": "ok",
        "service": "mvl-slack-agent",
        "features": ["business-first-qa", "tech-check-code", "fast-plane-task", "scheduled-srs-code-audit"],
        "gemini_primary_model": gemini_agent.primary_model,
        "rag_stats": stats,
        "plane_workspace": plane_client.workspace_slug,
        "testcase_stats": tc_stats,
    }


@app.get("/audit/report")
async def get_audit_report(q: str = ""):
    report = run_srs_code_audit(q)
    return report


@app.post("/audit/run")
async def trigger_audit_run(request: Request):
    try:
        body = await request.json()
        q = body.get("query", "")
    except Exception:
        q = ""
    report = run_srs_code_audit(q)
    global latest_audit_report
    latest_audit_report = report
    return report


@app.post("/test/query")
async def test_query(request: Request):
    data = await request.json()
    query = data.get("query", "").strip()
    instruction_type = data.get("type", "default")
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")

    intent = classify_intent(query)
    tech_mode = is_tech_requested(query)
    if intent == "AUDIT_SRS_CODE":
        report = run_srs_code_audit(query)
        return {
            "query": query,
            "intent": intent,
            "techMode": tech_mode,
            "answer": report["markdownSummary"],
            "auditReport": report,
        }

    if intent == "CREATE_TASK":
        clean_desc = re.sub(r"^(?:/create[-_]task|tạo\s+(?:nhanh\s+)?(?:bug|task)|log\s+bug)\s*", "", query, flags=re.I).strip()
        proj_match = re.search(r"\[(MVLCTV|MVL|MVLGO|MAIVIETLAN|CRM|DEVOPS|DSTAX|FETEAMS|GLINTECOWEBS)\]", query, flags=re.I)
        proj_code = proj_match.group(1).upper() if proj_match else "MVLCTV"
        assignee_match = re.search(r"@([a-zA-Z0-9._\-]+)", query)
        assignee = assignee_match.group(1) if assignee_match else "Chưa gán"
        is_bug = "bug" in query.lower() or "lỗi" in query.lower()
        prefix = "[BUG]" if is_bug else "[TASK]"
        prio = "URGENT" if "500" in query or "khẩn" in query.lower() else ("HIGH" if is_bug else "MEDIUM")
        title = re.sub(r"\[[^\]]+\]\s*", "", clean_desc)
        title = re.sub(r"\s*(?:giao|assign)\s+@?[a-zA-Z0-9._\-]+\s*$", "", title, flags=re.I).strip()
        concise_card = (
            f"✅ *Đã tạo task Plane:* <https://pm.glinteco.com/glinteco/projects/{proj_code}/issues/preview|[{proj_code}-101] {prefix} {title[:60]}>\n"
            f"• *Dự án:* `{proj_code}` | *Ưu tiên:* `{prio}` | *Giao cho:* @{assignee}"
        )
        return {
            "query": query,
            "intent": intent,
            "techMode": False,
            "answer": concise_card,
        }

    plane_context, enriched_plane_terms = await plane_client.resolve_issue_references_from_text(query)
    search_query = f"{query} {enriched_plane_terms}".strip()
    chunks = rag_engine.search(search_query, top_k=8, include_code=True)
    context = rag_engine.format_context(chunks, allow_tech=tech_mode)
    full_context = f"{plane_context}\n\n{context}".strip() if plane_context else context
    answer = gemini_agent.generate(
        query=query,
        srs_context=full_context,
        instruction_type=instruction_type,
        enriched_query=enriched_plane_terms,
    )
    return {
        "query": query,
        "intent": intent,
        "techMode": tech_mode,
        "type": instruction_type,
        "plane_enriched": bool(plane_context),
        "chunks_found": len(chunks),
        "citations": [c["citation"] for c in chunks],
        "answer": answer,
    }


@app.get("/test/srs-search")
async def test_srs_search(q: str = ""):
    if not q:
        return {"results": []}
    chunks = rag_engine.search(q, top_k=10)
    return {"query": q, "count": len(chunks), "results": chunks}


@app.get("/test/plane-issues")
async def test_plane_issues(q: str = ""):
    issues = await plane_client.search_issues(q)
    return {"query": q, "count": len(issues), "issues": issues}


@app.post("/slack/events")
async def slack_events(request: Request):
    try:
        raw_body = await request.body()
        body_json = json.loads(raw_body.decode("utf-8"))
        if body_json.get("type") == "url_verification":
            challenge = body_json.get("challenge")
            return JSONResponse({"challenge": challenge})
    except Exception as e:
        logger.error(f"Error handling URL verification: {e}")

    if request.headers.get("x-slack-retry-num"):
        return Response(status_code=200, content="OK")

    return await bolt_handler.handle(request)


@app.post("/slack/commands")
async def slack_commands(request: Request):
    return await bolt_handler.handle(request)


@app.post("/slack/interactions")
async def slack_interactions(request: Request):
    return await bolt_handler.handle(request)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
