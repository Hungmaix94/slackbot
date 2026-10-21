import os
import re
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, Optional, List

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Response, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
import httpx

from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.fastapi.async_handler import AsyncSlackRequestHandler
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler

from rag_engine import SRSRagEngine
from gemini_agent import GeminiAgent
from plane_client import PlaneClient
from excel_generator import parse_all_markdown_tables, create_excel_from_tables
from user_mapping import extract_and_resolve_assignees

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("mvl-slack-agent")

# Initialize core services
rag_engine = SRSRagEngine()
gemini_agent = GeminiAgent()
plane_client = PlaneClient()

# Initialize Slack Bolt Async App
slack_bot_token = os.environ.get("SLACK_BOT_TOKEN", "")
slack_app_token = os.environ.get("SLACK_APP_TOKEN", "")
slack_signing_secret = os.environ.get("SLACK_SIGNING_SECRET", "")

bolt_app = AsyncApp(
    token=slack_bot_token,
    signing_secret=slack_signing_secret or "dummy_secret_for_railway_deploy",
    request_verification_enabled=bool(slack_signing_secret),
)
bolt_handler = AsyncSlackRequestHandler(bolt_app)

# Background tasks reference
background_tasks_set = set()

# Helper: download file from Slack
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

# Helper: markdown links to Slack links
def markdown_to_slack_links(text: str) -> str:
    pattern = r'\[([^\]]+)\]\((https?://[^\)]+)\)'
    return re.sub(pattern, r'<\2|\1>', text)

# Helper: build Block Kit answer blocks with interactive buttons
def create_answer_blocks(
    text: str,
    has_excel: bool = False,
    excel_file_name: str = "export.xlsx",
    is_uat: bool = False,
    is_usecase: bool = False,
) -> List[Dict[str, Any]]:
    blocks = []
    safe_text = text if text and text.strip() else "Không có nội dung phản hồi từ hệ thống."
    slack_text = markdown_to_slack_links(safe_text)

    # Chia nhỏ text nếu vượt quá 2800 ký tự (giới hạn block mrkdwn Slack là 3000)
    chunk_size = 2800
    for i in range(0, len(slack_text), chunk_size):
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": slack_text[i:i + chunk_size],
            },
        })

    # Interactive action buttons
    action_elements = []
    if has_excel:
        action_elements.append({
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "📊 Tải Excel",
                "emoji": True,
            },
            "action_id": "download_excel",
            "value": excel_file_name,
            "style": "primary",
        })

    if is_uat:
        action_elements.append({
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "➕ Thêm Kịch bản Biên",
                "emoji": True,
            },
            "action_id": "expand_edge_cases",
            "value": "edge_cases",
        })

    action_elements.append({
        "type": "button",
        "text": {
            "type": "plain_text",
            "text": "🐛 Tạo Bug Plane",
            "emoji": True,
        },
        "action_id": "create_plane_task",
        "value": "create_task",
    })

    if action_elements:
        blocks.append({
            "type": "actions",
            "elements": action_elements,
        })

    return blocks

# Helper: process Q&A and respond
async def process_query_and_reply(
    query: str,
    channel_id: str,
    thread_ts: Optional[str],
    client,
    say,
    instruction_type: str = "default",
    history: Optional[List[Dict[str, Any]]] = None,
):
    try:
        logger.info(f"Processing query: '{query[:60]}...' (type={instruction_type})")
        # 1. Search SRS
        chunks = rag_engine.search(query, top_k=5)
        srs_context = rag_engine.format_context(chunks)

        # 2. Generate response via Gemini
        answer = gemini_agent.generate(
            query=query,
            srs_context=srs_context,
            history=history,
            instruction_type=instruction_type,
        )

        # 3. Check for markdown tables to export to Excel
        tables = parse_all_markdown_tables(answer)
        excel_path = None
        excel_name = "export.xlsx"
        if tables and instruction_type in ["usecase", "testcase"]:
            try:
                excel_name = "LAD-UseCase-List.xlsx" if instruction_type == "usecase" else "Kịch bản UAT.xlsx"
                temp_filename = f"/tmp/{excel_name}"
                create_excel_from_tables(tables, temp_filename, query=query)
                excel_path = temp_filename
            except Exception as ex:
                logger.error(f"Failed to generate Excel file: {ex}")

        # 4. Reply in Slack using Block Kit (with [🐛 Tạo Bug Plane] button)
        blocks = create_answer_blocks(
            text=answer,
            has_excel=bool(excel_path),
            excel_file_name=excel_name,
            is_uat=(instruction_type == "testcase"),
            is_usecase=(instruction_type == "usecase"),
        )
        await say(
            text=markdown_to_slack_links(answer[:200]),
            blocks=blocks,
            thread_ts=thread_ts,
        )

        # 5. Upload Excel file if generated
        if excel_path and os.path.exists(excel_path):
            try:
                logger.info(f"Uploading Excel {excel_name} to Slack...")
                await client.files_upload_v2(
                    channel=channel_id,
                    file=excel_path,
                    filename=excel_name,
                    title=f"Bản xuất {excel_name}",
                    initial_comment=f"📊 Đã tự động tạo và xuất bảng kịch bản sang định dạng Excel ({excel_name}).",
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
        await say(f"⚠️ Đã có lỗi xảy ra trong quá trình xử lý: {str(e)}", thread_ts=thread_ts)

# Bolt Logging Middleware
@bolt_app.middleware
async def log_all_incoming_requests(logger, body, next):
    event = body.get("event", {})
    req_type = body.get("type", "unknown")
    event_type = event.get("type", "unknown")
    logger.info(f"⚡️ [Slack Event] request_type={req_type}, event_type={event_type}, user={event.get('user')}, channel={event.get('channel')}, text={event.get('text', '')[:80]}")
    return await next()

# Slack Event: message (for DMs and 1-on-1 chats)
@bolt_app.event("message")
async def handle_message_event(event, say, client):
    # Ignore bot messages to avoid loops
    if event.get("bot_id") or event.get("subtype") == "bot_message":
        return
    channel_type = event.get("channel_type")
    # Only process direct messages (DMs)
    if channel_type == "im":
        logger.info(f"Direct message (DM) received from user {event.get('user')}: {event.get('text', '')[:60]}")
        await handle_app_mention(event, say, client)

# Slack Event: app_mention
@bolt_app.event("app_mention")
async def handle_app_mention(event, say, client):
    logger.info(f"🎯 app_mention received: {event.get('text', '')[:80]} from user={event.get('user')} in channel={event.get('channel')}")
    text = event.get("text", "")
    thread_ts = event.get("thread_ts")
    ts = event.get("ts")
    channel_id = event.get("channel")
    target_thread_ts = thread_ts or ts

    # Clean bot mention
    try:
        auth_info = await client.auth_test()
        bot_user_id = auth_info.get("user_id")
    except Exception:
        bot_user_id = None

    query = text
    if bot_user_id:
        query = re.sub(rf"<@{bot_user_id}>", "", query).strip()

    if not query:
        await say(
            "👋 Xin chào! Tôi là trợ lý AI chuyên giải đáp nghiệp vụ SRS và điều phối công việc dự án MaiVietLand.\n"
            "Hãy đặt câu hỏi hoặc dùng các lệnh:\n"
            "- `@SRS Assist [câu hỏi]`\n"
            "- `/usecase [nghiệp vụ]`\n"
            "- `/testcase [nghiệp vụ]`\n"
            "- `/create-task` (trong thread)\n"
            "- `/bugs [từ khóa]`",
            thread_ts=target_thread_ts,
        )
        return

    # Check for commands in text
    instruction_type = "default"
    if query.startswith("/usecase") or query.lower().startswith("usecase"):
        query = re.sub(r"^/?usecase\s*", "", query, flags=re.IGNORECASE).strip()
        instruction_type = "usecase"
    elif query.startswith("/testcase") or query.lower().startswith("testcase"):
        query = re.sub(r"^/?testcase\s*", "", query, flags=re.IGNORECASE).strip()
        instruction_type = "testcase"
    elif any(term in query.lower() for term in ["tạo task", "create task", "log bug", "tạo bug"]):
        if not thread_ts:
            await say("⚠️ Để tạo task trên Plane/ClickUp, bạn vui lòng tag tôi trong một thread thảo luận cụ thể.", thread_ts=target_thread_ts)
            return
        await handle_create_task_from_thread(
            channel_id=channel_id,
            thread_ts=thread_ts,
            client=client,
            say=say,
            trigger_text=text,
            bot_user_id=bot_user_id,
        )
        return

    # Fetch thread history if present
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
            instruction_type=instruction_type,
            history=history[-6:] if history else None,
        )
    )
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)

# Helper: Create Plane issue from thread
async def handle_create_task_from_thread(
    channel_id: str,
    thread_ts: str,
    client,
    say,
    trigger_text: str = "",
    bot_user_id: Optional[str] = None,
):
    try:
        await say("⏳ Đang phân tích nội dung thread và khởi tạo task trên Plane...", thread_ts=thread_ts)
        res = await client.conversations_replies(channel=channel_id, ts=thread_ts)
        messages = res.get("messages", [])
        if not messages:
            await say("⚠️ Thread thảo luận không có nội dung.", thread_ts=thread_ts)
            return

        conversation_text = "\n".join([f"- {m.get('user', 'User')}: {m.get('text', '')}" for m in messages])
        task_info_raw = gemini_agent.generate(
            query=f"Trích xuất thông tin task từ thread:\n{conversation_text}",
            instruction_type="task_extract",
        )

        try:
            clean_json = re.sub(r"^```json\s*|\s*```$", "", task_info_raw.strip())
            task_data = json.loads(clean_json)
        except Exception:
            task_data = {
                "name": f"Công việc từ Slack thread {thread_ts}",
                "description_html": conversation_text,
                "priority": "medium",
            }

        name = task_data.get("name", f"Task from Slack {thread_ts}")
        desc = task_data.get("description_html", conversation_text)
        priority = task_data.get("priority", "medium")

        # Resolve assignees from Slack trigger text, thread, and explicit_assignee
        resolved_assignees = await extract_and_resolve_assignees(
            client=client,
            trigger_text=trigger_text,
            messages=messages,
            bot_user_id=bot_user_id,
            plane_client=plane_client,
            explicit_assignee_text=task_data.get("explicit_assignee"),
        )
        assignee_ids = [a[0] for a in resolved_assignees] if resolved_assignees else None

        # Create issue on Plane
        clean_thread_ts = thread_ts.replace(".", "")
        slack_thread_link = f"https://slack.com/archives/{channel_id}/p{clean_thread_ts}"
        final_description = f"{desc}\n<hr/>\n<p>🔗 <em>Tạo tự động từ Slack thread: <a href=\"{slack_thread_link}\" target=\"_blank\">Xem thảo luận trên Slack</a></em></p>"

        issue = await plane_client.create_issue(
            name=name,
            description_html=final_description,
            priority=priority,
            assignee_ids=assignee_ids,
        )

        issue_id = issue.get("id")
        issue_url = issue.get("url")

        # Upload Slack attachments to Plane if any
        uploaded_count = 0
        for m in messages:
            files = m.get("files", [])
            for f in files:
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

        msg_reply = f"✅ Đã tạo thành công task trên Plane!\n- **Tiêu đề:** {name}\n- **Đường dẫn:** <{issue_url}|Xem trên Plane>"
        if resolved_assignees:
            assignee_labels = ", ".join([a[1] for a in resolved_assignees])
            msg_reply += f"\n- **Người phụ trách:** {assignee_labels}"
        if uploaded_count > 0:
            msg_reply += f"\n- **Đính kèm:** Đã tải lên {uploaded_count} tệp từ Slack."
        await say(msg_reply, thread_ts=thread_ts)

    except Exception as e:
        logger.error(f"Error creating task from thread: {e}", exc_info=True)
        await say(f"❌ Lỗi khi tạo task trên Plane: {str(e)}", thread_ts=thread_ts)

# Interactive Action: [🐛 Tạo Bug Plane] button click
@bolt_app.action("create_plane_task")
async def handle_create_plane_task_action(ack, body, client, say):
    await ack()
    channel_id = body.get("channel", {}).get("id")
    message = body.get("message", {})
    thread_ts = message.get("thread_ts") or message.get("ts")
    if not channel_id or not thread_ts:
        logger.warning(f"create_plane_task clicked without valid channel/thread: {body}")
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

# Slash Commands
@bolt_app.command("/srs")
async def handle_srs_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    channel_id = body.get("channel_id")
    if not text:
        await say("👋 Bạn đã dùng lệnh `/srs`. Hãy cung cấp thêm thông tin nghiệp vụ cần tra cứu! Ví dụ: `/srs quy trình đặt cọc`")
        return
    await say(f"⏳ Đang tra cứu tài liệu SRS cho: *{text}*...")
    task = asyncio.create_task(process_query_and_reply(text, channel_id, None, client, say, instruction_type="default"))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)

@bolt_app.command("/usecase")
async def handle_usecase_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    channel_id = body.get("channel_id")
    if not text:
        await say("👋 Hãy cung cấp nghiệp vụ cần sinh Use Case. Ví dụ: `/usecase tạm ứng hoa hồng`")
        return
    await say(f"⏳ Đang khởi tạo bộ Use Case cho: *{text}*...")
    task = asyncio.create_task(process_query_and_reply(text, channel_id, None, client, say, instruction_type="usecase"))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)

@bolt_app.command("/testcase")
async def handle_testcase_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    channel_id = body.get("channel_id")
    if not text:
        await say("👋 Hãy cung cấp nghiệp vụ cần sinh kịch bản test UAT. Ví dụ: `/testcase hợp đồng đặt cọc`")
        return
    await say(f"⏳ Đang thiết kế kịch bản UAT cho: *{text}*...")
    task = asyncio.create_task(process_query_and_reply(text, channel_id, None, client, say, instruction_type="testcase"))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)

@bolt_app.command("/create-task")
async def handle_create_task_command(ack, body, say, client):
    await ack()
    channel_id = body.get("channel_id")
    thread_ts = body.get("thread_ts")
    if not thread_ts:
        await say("⚠️ Lệnh `/create-task` chỉ hoạt động bên trong một thread thảo luận của Slack.")
        return
    task = asyncio.create_task(handle_create_task_from_thread(channel_id, thread_ts, client, say))
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)

@bolt_app.command("/bugs")
async def handle_bugs_command(ack, body, say, client):
    await ack()
    text = body.get("text", "").strip()
    if not text:
        await say("👋 Nhập từ khóa lỗi cần tra cứu. Ví dụ: `/bugs xuất excel`")
        return
    await say(f"⏳ Đang tìm kiếm các bug trên Plane liên quan đến: *{text}*...")
    async def _search_plane():
        issues = await plane_client.search_issues(text, filter_bugs=True)
        if not issues:
            await say(f"Không tìm thấy bug nào khớp với từ khóa '*{text}*'.")
            return
        lines = [f"- <{plane_client.get_issue_web_url(issue.get('project', ''), issue.get('id', ''))}|{issue.get('name')}> (Ưu tiên: {issue.get('priority', 'medium')})" for issue in issues[:10]]
        await say("🐞 **Các bug liên quan trên Plane:**\n" + "\n".join(lines))
    task = asyncio.create_task(_search_plane())
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)

# FastAPI Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up MVL Slack Agent Server...")
    stats = rag_engine.get_stats()
    logger.info(f"SRS RAG Engine stats: {stats}")

    socket_mode_task = None
    if slack_app_token:
        logger.info("Initializing Slack Socket Mode Handler...")
        socket_handler = AsyncSocketModeHandler(bolt_app, slack_app_token)
        socket_mode_task = asyncio.create_task(socket_handler.start_async())
        background_tasks_set.add(socket_mode_task)
        socket_mode_task.add_done_callback(background_tasks_set.discard)
        logger.info("Slack Socket Mode started in background task.")
    else:
        logger.warning("SLACK_APP_TOKEN is missing. Slack will only be accessible via HTTP webhooks.")

    yield

    logger.info("Shutting down MVL Slack Agent Server...")
    if socket_mode_task and not socket_mode_task.done():
        socket_mode_task.cancel()
        try:
            await socket_mode_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="MVL Slack Agent Server", lifespan=lifespan)

# Health endpoint
@app.get("/health")
async def health():
    stats = rag_engine.get_stats()
    return {
        "status": "ok",
        "service": "mvl-slack-agent",
        "gemini_primary_model": gemini_agent.primary_model,
        "rag_stats": stats,
        "plane_workspace": plane_client.workspace_slug,
    }

# Direct Test Query Endpoint
@app.post("/test/query")
async def test_query(request: Request):
    data = await request.json()
    query = data.get("query", "").strip()
    instruction_type = data.get("type", "default")
    if not query:
        raise HTTPException(status_code=400, detail="Missing query")

    chunks = rag_engine.search(query, top_k=5)
    context = rag_engine.format_context(chunks)
    answer = gemini_agent.generate(query=query, srs_context=context, instruction_type=instruction_type)
    return {
        "query": query,
        "type": instruction_type,
        "chunks_found": len(chunks),
        "citations": [c["citation"] for c in chunks],
        "answer": answer,
    }

# SRS search endpoint
@app.get("/test/srs-search")
async def test_srs_search(q: str = ""):
    if not q:
        return {"results": []}
    chunks = rag_engine.search(q, top_k=10)
    return {"query": q, "count": len(chunks), "results": chunks}

# Plane issues endpoint
@app.get("/test/plane-issues")
async def test_plane_issues(q: str = ""):
    issues = await plane_client.search_issues(q)
    return {"query": q, "count": len(issues), "issues": issues}

# Slack Webhooks HTTP endpoints
@app.post("/slack/events")
async def slack_events(request: Request):
    # Direct Slack URL verification challenge handling
    try:
        raw_body = await request.body()
        body_json = json.loads(raw_body.decode("utf-8"))
        if body_json.get("type") == "url_verification":
            challenge = body_json.get("challenge")
            logger.info(f"Handled Slack URL verification challenge: {challenge}")
            return JSONResponse({"challenge": challenge})
    except Exception as e:
        logger.error(f"Error handling URL verification: {e}")

    # Ignore Slack retries to avoid duplicate execution
    if request.headers.get("x-slack-retry-num"):
        logger.info(f"Ignoring Slack retry #{request.headers.get('x-slack-retry-num')}")
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
