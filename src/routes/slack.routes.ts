import { Hono } from "hono";
import { Env } from "../config/env";
import { verifySlackSignature } from "../slack/verify";
import { SlackClient } from "../slack/client";
import { AgentOrchestrator } from "../agents/orchestrator";

export const slackRoutes = new Hono<{ Bindings: Env }>();

// 1. Slack Events API (app_mention, message)
slackRoutes.post("/events", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature") || null;
  const timestamp = c.req.header("x-slack-request-timestamp") || null;

  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.text("Invalid JSON", 400);
  }

  // A. Xử lý Slack URL Verification Challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // B. Xác thực chữ ký Slack
  const isValid = await verifySlackSignature(
    c.env.SLACK_SIGNING_SECRET,
    signature,
    timestamp,
    rawBody
  );

  if (!isValid) {
    console.warn("Invalid Slack signature detected.");
    return c.text("Unauthorized", 401);
  }

  // C. Xử lý Event
  const event = body.event;
  if (!event) {
    return c.text("OK", 200);
  }

  // Bỏ qua tin nhắn từ chính bot (tránh loop vô tận)
  if (event.bot_id || event.subtype === "bot_message") {
    return c.text("OK", 200);
  }

  // Chỉ phản hồi khi bot được @mention hoặc nhận direct message
  if (event.type === "app_mention" || event.type === "message") {
    const channelId = event.channel;
    const threadTs = event.thread_ts || event.ts;
    const userId = event.user;
    const text = event.text || "";

    // Làm sạch câu query (bỏ mã tag bot <@UXXXXX>, <@UXXXXX|name>, <!here>...)
    const cleanQuery = text
      .replace(/<@[A-Z0-9_]+(?:\|[^>]+)?>/gi, "")
      .replace(/<![a-zA-Z0-9_]+>/g, "")
      .trim();

    // Chạy xử lý ngầm (Async dispatch) qua executionCtx để trả HTTP 200 ngay lập tức cho Slack
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const orchestrator = new AgentOrchestrator(c.env);
          let history: any[] = [];
          let effectiveQuery = cleanQuery;

          // Nếu mention diễn ra trong một thread, nạp ngữ cảnh thread
          if (event.thread_ts) {
            try {
              const slack = new SlackClient(c.env.SLACK_BOT_TOKEN);
              const threadMsgs = await slack.getConversationReplies(channelId, event.thread_ts);
              history = (threadMsgs || []).filter((m: any) => m.ts !== event.ts);

              // Nếu câu query quá ngắn, lấy câu hỏi/lỗi trước đó trong thread làm ngữ cảnh
              if (cleanQuery.length < 25 && history.length > 0) {
                const lastUserMsg = [...history].reverse().find((m: any) => !m.bot_id && m.text);
                if (lastUserMsg) {
                  const cleanedPrev = (lastUserMsg.text || "")
                    .replace(/<@[A-Z0-9_]+(?:\|[^>]+)?>/gi, "")
                    .replace(/<![a-zA-Z0-9_]+>/g, "")
                    .trim();
                  if (cleanedPrev) {
                    effectiveQuery = `${cleanedPrev}\n[Yêu cầu bổ sung: ${cleanQuery || "trả lời"}]`;
                  }
                }
              }
            } catch (histErr) {
              console.warn("Không thể tải lịch sử thread:", histErr);
            }
          }

          await orchestrator.handleQuery({
            channelId,
            threadTs,
            userId,
            query: effectiveQuery,
            history,
          });
        } catch (err) {
          console.error("Lỗi xử lý ngầm agent:", err);
        }
      })()
    );

    return c.text("OK", 200);
  }

  return c.text("OK", 200);
});

// 2. Slack Slash Commands (/usecase, /testcase, /create-task, /bugs)
slackRoutes.post("/commands", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature") || null;
  const timestamp = c.req.header("x-slack-request-timestamp") || null;

  const isValid = await verifySlackSignature(
    c.env.SLACK_SIGNING_SECRET,
    signature,
    timestamp,
    rawBody
  );

  if (!isValid) {
    return c.text("Unauthorized", 401);
  }

  const formData = new URLSearchParams(rawBody);
  const command = formData.get("command") || "";
  const text = formData.get("text") || "";
  const channelId = formData.get("channel_id") || "";
  const userId = formData.get("user_id") || "";

  let fullQuery = `${command} ${text}`.trim();
  if (command === "/bug-p31") {
    fullQuery = `tạo bug [p31] ${text}`.trim();
  } else if (command === "/bug-as") {
    fullQuery = `tạo bug [as] ${text}`.trim();
  } else if (command === "/bug-crm") {
    fullQuery = `tạo bug [crm] ${text}`.trim();
  } else if (command === "/bug-ai") {
    fullQuery = `tạo bug [ai] ${text}`.trim();
  } else if (command === "/bug-ui") {
    fullQuery = `tạo bug [ui] ${text}`.trim();
  } else if (command === "/plane-task" || command === "/create-task") {
    fullQuery = `tạo task ${text}`.trim();
  } else if (command === "/plane-bug" || command === "/create-bug") {
    fullQuery = `tạo bug ${text}`.trim();
  } else if (command === "/srs") {
    fullQuery = `tra cứu srs ${text}`.trim();
  }

  c.executionCtx.waitUntil(
    (async () => {
      try {
        const orchestrator = new AgentOrchestrator(c.env);
        await orchestrator.handleQuery({
          channelId,
          threadTs: "",
          userId,
          query: fullQuery,
        });
      } catch (e) {
        console.error("Slash command execution error:", e);
      }
    })()
  );

  return c.json({
    response_type: "in_channel",
    text: `⚡ Đã tiếp nhận lệnh \`${command}\`. Bot đang xử lý...`,
  });
});

// 3. Slack Block Kit Interactions (Button clicks)
slackRoutes.post("/interactions", async (c) => {
  const rawBody = await c.req.text();
  const formData = new URLSearchParams(rawBody);
  const payloadStr = formData.get("payload");

  if (!payloadStr) {
    return c.text("Missing payload", 400);
  }

  const payload = JSON.parse(payloadStr);
  const action = payload.actions?.[0];
  const channelId = payload.channel?.id;
  const threadTs = payload.message?.thread_ts || payload.message?.ts;
  const userId = payload.user?.id;

  if (action?.action_id === "create_plane_task" || action?.action_id === "create_clickup_task") {
    c.executionCtx.waitUntil(
      (async () => {
        const orchestrator = new AgentOrchestrator(c.env);
        await orchestrator.handleQuery({
          channelId,
          threadTs,
          userId,
          query: "/create_task",
        });
      })()
    );
    return c.text("OK", 200);
  }

  return c.text("OK", 200);
});
