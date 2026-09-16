import { Hono } from "hono";
import { Env } from "./config/env";
import { verifySlackSignature } from "./slack/verify";
import { AgentOrchestrator, CODE_TOOLS } from "./agents/orchestrator";
import { ingestDocuments } from "./rag/sync-webhook";
import { SrsSearchService } from "./rag/search";
import { classifyIntent } from "./agents/router";
import {
  SYSTEM_INSTRUCTION_DEFAULT,
  SYSTEM_INSTRUCTION_BA,
  SYSTEM_INSTRUCTION_QA,
  SYSTEM_INSTRUCTION_DEV,
} from "./agents/prompts";
import { WorkersAiClient } from "./ai/workers-ai";
import { GeminiClient, GeminiContent } from "./ai/gemini";
import { GitHubClient } from "./github/client";
import { getSmartCodeContext } from "./agents/code-context";

import { PlaneClient } from "./plane/client";

const app = new Hono<{ Bindings: Env }>();

// 1. Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", service: "mvl-slack-assistant", timestamp: new Date().toISOString() });
});

// Sync / Inspect Plane users
app.get("/plane/users", async (c) => {
  if (!c.env.PLANE_API_KEY) {
    return c.json({ error: "No PLANE_API_KEY" }, 500);
  }
  const plane = new PlaneClient(c.env.PLANE_API_KEY, c.env.PLANE_API_HOST_URL, c.env.PLANE_WORKSPACE_SLUG);
  const projectId = c.env.PLANE_DEFAULT_PROJECT_ID || "e92f7ba8-0db9-487f-a21c-13712d226eb8";
  try {
    const projectMembers = await plane.getProjectMembers(projectId);
    const workspaceMembers = await plane.getWorkspaceMembers();
    return c.json({
      project_members_count: projectMembers.length,
      project_members: projectMembers.map((m) => ({
        id: m.id,
        email: m.email,
        display_name: m.display_name,
        name: `${m.first_name || ""} ${m.last_name || ""}`.trim(),
      })),
      workspace_members_count: workspaceMembers.length,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.get("/", (c) => {
  return c.text("MVL Assistant Slackbot (Cloudflare Edge Edition) is running!");
});

// 2. Slack Events API (app_mention, message)
app.post("/slack/events", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-slack-signature") || null;
  const timestamp = c.req.header("x-slack-request-timestamp") || null;

  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.text("Invalid JSON", 400);
  }

  // A. Xử lý Slack URL Verification Challenge (không cần check signature khi setup app lần đầu)
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

  // Bắt sự kiện app_mention (tag @bot)
  if (event.type === "app_mention") {
    const channelId = event.channel;
    const threadTs = event.thread_ts || event.ts;
    const userId = event.user;
    const text = event.text || "";

    // Làm sạch câu query (bỏ mã tag bot <@UXXXXX>)
    const cleanQuery = text.replace(/<@[A-Z0-9]+>/g, "").trim();

    // Chạy xử lý ngầm (Async dispatch) qua executionCtx để trả HTTP 200 ngay lập tức cho Slack
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const orchestrator = new AgentOrchestrator(c.env);
          await orchestrator.handleQuery({
            channelId,
            threadTs,
            userId,
            query: cleanQuery,
          });
        } catch (e) {
          console.error("Async orchestrator error:", e);
        }
      })()
    );

    // Trả về HTTP 200 ngay lập tức (< 200ms) để Slack không retry
    return c.text("OK", 200);
  }

  return c.text("OK", 200);
});

// 3. Slack Slash Commands (/usecase, /testcase, /create-task, /bugs)
app.post("/slack/commands", async (c) => {
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

  const fullQuery = `${command} ${text}`.trim();

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

// 4. Slack Block Kit Interactions (Button clicks)
app.post("/slack/interactions", async (c) => {
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

// 5. Ingest Webhook (Đồng bộ tài liệu SRS từ GitHub Actions / Webhook)
app.post("/sync/github", async (c) => {
  const secret = c.req.header("x-sync-secret");
  if (c.env.GITHUB_WEBHOOK_SECRET && secret !== c.env.GITHUB_WEBHOOK_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const body = await c.req.json();
  const documents = body.documents || [];

  if (!Array.isArray(documents) || documents.length === 0) {
    return c.json({ message: "No documents provided for sync." }, 400);
  }

  const result = await ingestDocuments(c.env, documents);
  return c.json({
    success: true,
    message: `Successfully synced ${result.ingestedDocs} documents (${result.totalChunks} chunks).`,
  });
});

// 6. Test Endpoint (cho phép kiểm tra trực tiếp phản hồi của Cloudflare Workers AI)
app.post("/test/query", async (c) => {
  try {
    const body = await c.req.json();
    const query = body.query || "";
    if (!query) return c.json({ error: "Missing query" }, 400);

  const srsSearch = new SrsSearchService(c.env);
  const srsResults = await srsSearch.search(query, 4);

  let srsContext = "";
  if (srsResults.length > 0) {
    srsContext = "\n\n=== TÀI LIỆU SRS THAM CHIẾU TỪ HỆ THỐNG ===\n";
    srsResults.forEach((r, idx) => {
      srsContext += `\n[Tài liệu ${idx + 1}: ${r.docId} | Đề mục: ${r.heading}]\n${r.content}\n`;
    });
  }

  const intent = classifyIntent(query);
  let systemInstruction = SYSTEM_INSTRUCTION_DEFAULT;
  if (intent === "BA") systemInstruction = SYSTEM_INSTRUCTION_BA;
  if (intent === "QA") systemInstruction = SYSTEM_INSTRUCTION_QA;
  if (intent === "CODE_DEV") systemInstruction = SYSTEM_INSTRUCTION_DEV;

  const github = c.env.GITHUB_TOKEN ? new GitHubClient(c.env.GITHUB_TOKEN) : undefined;
  let codeContext = "";
  if (intent === "CODE_DEV" && github) {
    codeContext = await getSmartCodeContext(query, github);
  }

  const useWorkersAi = c.env.AI_PROVIDER === "cloudflare" || !c.env.GEMINI_API_KEY;
  const aiClient = useWorkersAi && c.env.AI
    ? new WorkersAiClient(c.env)
    : new GeminiClient(c.env);

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [{ text: `${query}\n\n${srsContext}${codeContext}` }],
    },
  ];

  const tools = codeContext ? undefined : (github ? [{ functionDeclarations: CODE_TOOLS }] : undefined);

  let responseText = "";
  const maxTurns = codeContext ? 1 : 3;
  let currentTurn = 0;
  const toolTrace: any[] = [];

  while (currentTurn < maxTurns) {
    currentTurn++;
    const isFinalTurn = currentTurn === maxTurns;
    const activeTools = isFinalTurn ? undefined : tools;

    const aiResponse = await aiClient.generateContent({
      contents,
      systemInstruction: isFinalTurn
        ? `${systemInstruction}\n\nLƯU Ý: Đây là lượt trả lời chính thức cuối cùng. Bạn hãy dựa trên tất cả tài liệu SRS và các đoạn mã nguồn đã được cung cấp để giải thích tường tận nguyên nhân gốc rễ, trích dẫn file code và đưa ra giải pháp rõ ràng bằng tiếng Việt theo đúng cấu trúc 3 phần. TUYỆT ĐỐI KHÔNG gọi thêm tool.`
        : systemInstruction,
      tools: activeTools,
      temperature: 0.2,
    });

    if (!isFinalTurn && aiResponse.functionCalls && aiResponse.functionCalls.length > 0 && github) {
      for (const call of aiResponse.functionCalls) {
        contents.push({
          role: "model",
          parts: [{ functionCall: call }],
        });

        let toolResult = "";
        try {
          if (call.name === "search_codebase") {
            const repo = call.args.repo || "backend";
            const q = call.args.query || "";
            const searchRes = await github.searchCode(repo, q);
            toolResult = JSON.stringify(searchRes);
          } else if (call.name === "read_code_file") {
            const repo = call.args.repo || "backend";
            const filePath = call.args.filePath || "";
            const fileRes = await github.readFile(repo, filePath, {
              startLine: call.args.startLine,
              endLine: call.args.endLine,
            });
            toolResult = fileRes.content;
          } else if (call.name === "list_repository_files") {
            const repo = call.args.repo || "backend";
            const prefix = call.args.prefix || "";
            const listRes = await github.listFiles(repo, { prefix });
            toolResult = JSON.stringify(listRes);
          }
        } catch (toolErr: any) {
          toolResult = `Error: ${toolErr.message || String(toolErr)}`;
        }

        toolTrace.push({ name: call.name, args: call.args, resultSnippet: toolResult.slice(0, 300) });

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name,
                response: { result: toolResult },
              },
            },
          ],
        });
      }
    } else {
      responseText = aiResponse.text;
      break;
    }
  }

    return c.json({
      query,
      intent,
      provider: useWorkersAi ? "cloudflare-workers-ai" : "gemini",
      model: useWorkersAi ? (c.env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct") : (c.env.DEFAULT_MODEL || "gemini-2.5-flash"),
      srsCount: srsResults.length,
      toolTrace,
      response: responseText,
    });
  } catch (err: any) {
    return c.json({ error: err.message || String(err), stack: err.stack }, 500);
  }
});

export default app;
