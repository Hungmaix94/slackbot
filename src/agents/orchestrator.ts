import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import { SrsSearchService } from "../rag/search";
import { ClickUpClient } from "../clickup/client";
import { GitHubClient } from "../github/client";
import { GeminiClient, GeminiContent, GeminiFunctionDeclaration } from "../ai/gemini";
import { WorkersAiService, WorkersAiClient } from "../ai/workers-ai";
import { classifyIntent } from "./router";
import { getSmartCodeContext } from "./code-context";
import {
  SYSTEM_INSTRUCTION_DEFAULT,
  SYSTEM_INSTRUCTION_BA,
  SYSTEM_INSTRUCTION_QA,
  SYSTEM_INSTRUCTION_DEV,
} from "./prompts";
import { parseAllMarkdownTables } from "../utils/markdown";
import { generateExcelFromTables } from "../excel/generator";
import { createAnswerBlocks, createProgressBlock, createTaskCreatedCard } from "../slack/blocks";
import { resolveClickUpUserId } from "../slack/user-mapping";
import { checkDuplicateClickUpTasks } from "../clickup/duplicates";
import { buildBugTaskDescription } from "../clickup/task-builder";

export const CODE_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "search_codebase",
    description: "Tìm kiếm các file code hoặc biểu thức logic trong repository. QUAN TRỌNG: Mã nguồn dự án viết bằng tiếng Anh/Python/TypeScript. KHÔNG tìm bằng câu tiếng Việt. Bắt buộc dùng từ khóa kỹ thuật, tên model, hàm hoặc biến (ví dụ: 'SalesInvoice', 'sales_invoice', 'pdcdt', 'reconciliation', 'period', 'commission').",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo hoặc alias: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        query: {
          type: "STRING",
          description: "Từ khóa code tiếng Anh, tên class, hàm, model (ví dụ: 'SalesInvoice', 'sales_invoice', 'reconciliation', 'period').",
        },
      },
      required: ["repo", "query"],
    },
  },
  {
    name: "read_code_file",
    description: "Đọc nội dung của một file code cụ thể từ GitHub. Có thể chỉ định khoảng dòng bắt đầu và kết thúc.",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo hoặc alias: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        filePath: {
          type: "STRING",
          description: "Đường dẫn file (ví dụ: 'apps/advances/services.py' hoặc 'src/api/schema.ts').",
        },
        startLine: {
          type: "INTEGER",
          description: "Dòng bắt đầu cần đọc (1-indexed).",
        },
        endLine: {
          type: "INTEGER",
          description: "Dòng kết thúc cần đọc.",
        },
      },
      required: ["repo", "filePath"],
    },
  },
  {
    name: "list_repository_files",
    description: "Liệt kê danh sách các file trong thư mục của một repository trên GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        prefix: {
          type: "STRING",
          description: "Tiền tố thư mục cần duyệt (ví dụ: 'apps/booking' hoặc 'src/pages').",
        },
      },
      required: ["repo"],
    },
  },
];

export class AgentOrchestrator {
  private env: Env;
  private slack: SlackClient;
  private srsSearch: SrsSearchService;
  private clickup?: ClickUpClient;
  private github?: GitHubClient;

  constructor(env: Env) {
    this.env = env;
    this.slack = new SlackClient(env.SLACK_BOT_TOKEN);
    this.srsSearch = new SrsSearchService(env);
    if (env.CLICKUP_API_TOKEN) {
      this.clickup = new ClickUpClient(env.CLICKUP_API_TOKEN);
    }
    if (env.GITHUB_TOKEN) {
      this.github = new GitHubClient(env.GITHUB_TOKEN);
    }
  }

  async handleQuery(params: {
    channelId: string;
    threadTs: string;
    userId: string;
    query: string;
    history?: any[];
  }): Promise<void> {
    const { channelId, threadTs, userId, query } = params;
    const targetThreadTs = threadTs;

    // 1. Gửi tin nhắn tiến trình đầu tiên
    const progressMsg = await this.slack.postMessage(
      channelId,
      "⏳ Đang khởi động phân tích yêu cầu...",
      {
        thread_ts: targetThreadTs,
        blocks: createProgressBlock(1, 3, "Đang phân tích ý định & tra cứu tài liệu SRS..."),
      }
    );

    try {
      const intent = classifyIntent(query);

      // XỬ LÝ INTENT: TẠO TASK TRÊN CLICKUP TỪ THREAD
      if (intent === "CREATE_TASK") {
        await this.handleCreateTaskFromThread(channelId, targetThreadTs, userId, progressMsg.ts);
        return;
      }

      // XỬ LÝ INTENT: TRA CỨU BUG TRÊN CLICKUP
      if (intent === "SEARCH_CLICKUP") {
        await this.handleSearchClickup(channelId, targetThreadTs, query, progressMsg.ts);
        return;
      }

      // 2. Tra cứu RAG trong SRS
      await this.slack.updateMessage(
        channelId,
        progressMsg.ts,
        "⏳ Đang tra cứu tài liệu SRS...",
        {
          blocks: createProgressBlock(2, 3, "Đang đối chiếu tài liệu SRS & lịch sử hội thoại..."),
        }
      );

      const srsResults = await this.srsSearch.search(query, 4);
      let srsContext = "";
      if (srsResults.length > 0) {
        srsContext = "\n\n=== TÀI LIỆU SRS THAM CHIẾU TỪ HỆ THỐNG ===\n";
        srsResults.forEach((r, idx) => {
          srsContext += `\n[Tài liệu ${idx + 1}: ${r.docId} | Đề mục: ${r.heading}]\n${r.content}\n`;
        });
      } else {
        srsContext = "\n\n[Thông báo: Không tìm thấy tài liệu SRS tương ứng trong cơ sở dữ liệu]";
      }

      // 3. Chọn System Instruction theo Intent
      let systemInstruction = SYSTEM_INSTRUCTION_DEFAULT;
      if (intent === "BA") systemInstruction = SYSTEM_INSTRUCTION_BA;
      if (intent === "QA") systemInstruction = SYSTEM_INSTRUCTION_QA;
      let codeContext = "";
      if (intent === "CODE_DEV") {
        if (!this.github) {
          await this.slack.updateMessage(
            channelId,
            progressMsg.ts,
            "⚠️ Tính năng tra cứu mã nguồn yêu cầu cấu hình `GITHUB_TOKEN`. Bạn vui lòng cấu hình secret: `npx wrangler secret put GITHUB_TOKEN`."
          );
          return;
        }
        systemInstruction = SYSTEM_INSTRUCTION_DEV;

        // Tự động nạp mã nguồn liên quan trực tiếp đến câu hỏi
        codeContext = await getSmartCodeContext(query, this.github);
        if (codeContext) {
          await this.slack.updateMessage(
            channelId,
            progressMsg.ts,
            "⏳ [Code Agent] Đã đọc trực tiếp mã nguồn backend liên quan, đang phân tích logic...",
            {
              blocks: createProgressBlock(2, 3, "Đã đọc trực tiếp mã nguồn backend, đang mổ xẻ nguyên nhân..."),
            }
          );
        }
      }

      // 4. Xây dựng nội dung gửi tới AI
      const contents: GeminiContent[] = [];

      // Nạp lịch sử hội thoại gần nhất nếu có
      if (params.history && params.history.length > 0) {
        for (const msg of params.history.slice(-6)) {
          const role = msg.bot_id ? "model" : "user";
          const text = (msg.text || "").replace(/<@[A-Z0-9]+>/g, "").trim();
          if (text) {
            contents.push({ role, parts: [{ text }] });
          }
        }
      }

      contents.push({
        role: "user",
        parts: [{ text: `${query}\n\n${srsContext}${codeContext}` }],
      });

      // 5. Khởi tạo AI Client: Cloudflare Workers AI (mặc định) hoặc Gemini
      const useWorkersAi = this.env.AI_PROVIDER === "cloudflare" || !this.env.GEMINI_API_KEY;
      const aiClient = useWorkersAi && this.env.AI
        ? new WorkersAiClient(this.env)
        : new GeminiClient(this.env);

      // Nếu đã có codeContext nạp sẵn, không cần dùng tool gọi lại để tránh timeout 30s của Workers
      const tools = codeContext ? undefined : (this.github ? [{ functionDeclarations: CODE_TOOLS }] : undefined);
      let responseText = "";
      const maxTurns = codeContext ? 1 : 2;
      let currentTurn = 0;

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

        if (!isFinalTurn && aiResponse.functionCalls && aiResponse.functionCalls.length > 0 && this.github) {
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
                await this.slack.updateMessage(
                  channelId,
                  progressMsg.ts,
                  `⏳ [Code Agent] Đang tìm kiếm "${q}" trong repo ${repo}...`,
                  {
                    blocks: createProgressBlock(2, 3, `Đang tìm "${q}" trong repo ${repo}...`),
                  }
                );
                const searchRes = await this.github.searchCode(repo, q);
                toolResult = JSON.stringify(searchRes);
              } else if (call.name === "read_code_file") {
                const repo = call.args.repo || "backend";
                const filePath = call.args.filePath || "";
                await this.slack.updateMessage(
                  channelId,
                  progressMsg.ts,
                  `⏳ [Code Agent] Đang đọc file ${filePath} (${repo})...`,
                  {
                    blocks: createProgressBlock(2, 3, `Đang đọc ${filePath} (${repo})...`),
                  }
                );
                const fileRes = await this.github.readFile(repo, filePath, {
                  startLine: call.args.startLine,
                  endLine: call.args.endLine,
                });
                toolResult = fileRes.content;
              } else if (call.name === "list_repository_files") {
                const repo = call.args.repo || "backend";
                const prefix = call.args.prefix || "";
                const listRes = await this.github.listFiles(repo, { prefix });
                toolResult = JSON.stringify(listRes);
              } else {
                toolResult = "Unknown function call";
              }
            } catch (toolErr: any) {
              toolResult = `Lỗi thực thi tool ${call.name}: ${toolErr.message || String(toolErr)}`;
            }

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

      // 6. Kiểm tra xem có bảng Markdown cần xuất Excel không
      const tables = parseAllMarkdownTables(responseText);
      let excelData: any = null;

      if (tables.length > 0) {
        await this.slack.updateMessage(
          channelId,
          progressMsg.ts,
          "📊 Đang sinh file Excel kịch bản...",
          {
            blocks: createProgressBlock(3, 3, "Đang định dạng bảng tính Excel chuyên nghiệp..."),
          }
        );

        try {
          excelData = await generateExcelFromTables(tables, query);
        } catch (excelErr) {
          console.error("Lỗi tạo file Excel:", excelErr);
        }
      }

      // 7. Cập nhật câu trả lời chính thức bằng Block Kit
      const answerBlocks = createAnswerBlocks(responseText, {
        hasExcel: !!excelData,
        excelFileName: excelData?.filename,
        isUsecase: intent === "BA",
        isUat: intent === "QA",
      });

      await this.slack.updateMessage(channelId, progressMsg.ts, responseText, {
        blocks: answerBlocks,
      });

      // 8. Nếu có file Excel, upload trực tiếp lên Slack
      if (excelData) {
        try {
          await this.slack.uploadFileV2(
            channelId,
            excelData.buffer,
            excelData.filename,
            excelData.isUsecase ? "Danh sách UseCase (Sinh tự động)" : "Kịch bản UAT (Sinh tự động)",
            "📊 Tôi đã tạo sẵn file Excel này theo định dạng chuẩn để bạn tải về trực tiếp:",
            targetThreadTs
          );

          // Tùy chọn: Lưu backup vào Cloudflare R2 nếu có binding
          if (this.env.R2) {
            const r2Key = `exports/${Date.now()}_${excelData.filename}`;
            await this.env.R2.put(r2Key, excelData.buffer);
          }
        } catch (uploadErr) {
          console.error("Lỗi khi upload file Excel lên Slack:", uploadErr);
        }
      }
    } catch (err: any) {
      console.error("Lỗi xử lý Agent:", err);
      await this.slack.updateMessage(
        channelId,
        progressMsg.ts,
        `❌ Lỗi khi xử lý yêu cầu: ${err.message || String(err)}`,
        {
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `❌ *Lỗi khi xử lý yêu cầu:* ${err.message || String(err)}`,
              },
            },
          ],
        }
      );
    }
  }

  private async handleCreateTaskFromThread(
    channelId: string,
    threadTs: string,
    slackUserId: string,
    progressMsgTs: string
  ): Promise<void> {
    if (!this.clickup) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Chưa cấu hình ClickUp API Token trong môi trường."
      );
      return;
    }

    const listId = this.env.CLICKUP_DEFAULT_LIST_ID || "901818745715";

    // 1. Lấy toàn bộ tin nhắn trong thread
    const messages = await this.slack.getConversationReplies(channelId, threadTs);
    if (!messages || messages.length === 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Không tìm thấy nội dung tin nhắn trong thread này để tạo task."
      );
      return;
    }

    // 2. Nhận diện người tạo
    const userMatch = await resolveClickUpUserId(slackUserId, this.slack, this.env);

    // 3. Tóm tắt nội dung bằng Gemini
    const threadText = messages.map((m) => `${m.user || "User"}: ${m.text || ""}`).join("\n");
    const gemini = new GeminiClient(this.env);

    const prompt = `Phân tích đoạn thảo luận sau từ Slack thread và trích xuất thông tin tạo Bug Report trên ClickUp theo định dạng JSON:
{
  "taskName": "[BUG] [Tên phân hệ] - Mô tả lỗi ngắn gọn (dưới 70 ký tự)",
  "moduleName": "Tên phân hệ (ví dụ: Quản lý Quỹ, Tạm ứng, Đặt cọc, HRM...)",
  "stepsToReproduce": ["Bước 1...", "Bước 2..."],
  "actualBehavior": "Mô tả lỗi thực tế",
  "expectedBehavior": "Mô tả kết quả mong muốn đúng nghiệp vụ",
  "severity": "Major / Blocker / Critical / Minor"
}

Nội dung thảo luận:
${threadText}`;

    const parsedRes = await gemini.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      temperature: 0.1,
    });

    let taskJson: any = {};
    try {
      const cleanJson = parsedRes.text.replace(/```json|```/g, "").trim();
      taskJson = JSON.parse(cleanJson);
    } catch {
      taskJson = {
        taskName: `[BUG] Lỗi phát hiện từ Slack thread ${threadTs}`,
        moduleName: "Chung",
        stepsToReproduce: ["Xem chi tiết trong link thảo luận Slack"],
        actualBehavior: messages[0]?.text?.substring(0, 100) || "Lỗi",
        expectedBehavior: "Hệ thống xử lý đúng nghiệp vụ",
        severity: "Major",
      };
    }

    // 4. Kiểm tra xem có bug nào bị trùng không (Smart Duplicate Check)
    const duplicateCheck = await checkDuplicateClickUpTasks(this.clickup, listId, taskJson.taskName);
    let duplicateWarning = "";
    if (duplicateCheck.hasDuplicate) {
      const dup = duplicateCheck.duplicateTasks[0];
      duplicateWarning = `\n> ⚠️ *Cảnh báo trùng lặp:* Phát hiện task tương tự trên ClickUp: <${dup.url}|[${dup.id}] ${dup.name}> (${dup.status})`;
    }

    // 5. Tạo mô tả task chuẩn theo template MVL
    const slackThreadUrl = `https://slack.com/app_redirect?channel=${channelId}&thread_ts=${threadTs}`;
    const description = buildBugTaskDescription({
      moduleName: taskJson.moduleName,
      environment: "Staging",
      deviceInfo: "Chrome / Web",
      severity: taskJson.severity,
      stepsToReproduce: taskJson.stepsToReproduce || [],
      actualBehavior: taskJson.actualBehavior,
      expectedBehavior: taskJson.expectedBehavior,
      slackThreadUrl,
      slackMetadata: `channel_id=${channelId} thread_ts=${threadTs}`,
    });

    // 6. Tạo task trên ClickUp
    const createdTask = await this.clickup.createTask(listId, {
      name: taskJson.taskName,
      markdown_description: description,
      assignees: userMatch.id ? [userMatch.id] : undefined,
    });

    // 7. Đính kèm các ảnh từ Slack vào task ClickUp
    let attachmentCount = 0;
    for (const msg of messages) {
      if (msg.files && Array.isArray(msg.files)) {
        for (const f of msg.files) {
          if (f.url_private) {
            try {
              const fileBuf = await this.slack.downloadPrivateFile(f.url_private);
              await this.clickup.uploadAttachment(
                createdTask.id,
                f.name || "slack_attachment.png",
                fileBuf,
                f.mimetype
              );
              attachmentCount++;
            } catch (attErr) {
              console.warn("Lỗi upload attachment lên ClickUp:", attErr);
            }
          }
        }
      }
    }

    // 8. Cập nhật thông báo lên Slack
    const cardBlocks = createTaskCreatedCard({
      id: createdTask.id,
      name: createdTask.name,
      url: createdTask.url || `https://app.clickup.com/t/${createdTask.id}`,
      assigneeName: userMatch.name,
      attachmentsCount: attachmentCount,
    });

    if (duplicateWarning) {
      cardBlocks.splice(1, 0, {
        type: "section",
        text: { type: "mrkdwn", text: duplicateWarning },
      });
    }

    await this.slack.updateMessage(channelId, progressMsgTs, "Đã tạo task ClickUp thành công!", {
      blocks: cardBlocks,
    });
  }

  private async handleSearchClickup(
    channelId: string,
    threadTs: string,
    query: string,
    progressMsgTs: string
  ): Promise<void> {
    if (!this.clickup) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Chưa cấu hình ClickUp API Token."
      );
      return;
    }

    const listId = this.env.CLICKUP_DEFAULT_LIST_ID || "901818745715";
    const tasks = await this.clickup.searchTasks(listId, query, true);

    if (tasks.length === 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        `🔍 Không tìm thấy bug/task nào liên quan đến từ khóa *"${query}"* trên ClickUp.`
      );
      return;
    }

    let reply = `🔍 *Tìm thấy ${tasks.length} task/bug liên quan trên ClickUp:*\n\n`;
    tasks.slice(0, 8).forEach((t) => {
      reply += `- <${t.url || `https://app.clickup.com/t/${t.id}`}|[${t.id}]> *${t.name}* (Trạng thái: \`${t.status?.status || "N/A"}\`)\n`;
    });

    await this.slack.updateMessage(channelId, progressMsgTs, reply);
  }
}
