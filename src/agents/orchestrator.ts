import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import { SrsSearchService } from "../rag/search";
import { ClickUpClient } from "../clickup/client";
import { PlaneClient } from "../plane/client";
import { GitHubClient } from "../github/client";
import { GeminiClient, GeminiContent, GeminiFunctionDeclaration } from "../ai/gemini";
import { WorkersAiClient } from "../ai/workers-ai";
import { classifyIntent, isTechRequested } from "./router";
import { getSmartCodeContext } from "./code-context";
import {
  SYSTEM_INSTRUCTION_DEFAULT,
  SYSTEM_INSTRUCTION_BA,
  SYSTEM_INSTRUCTION_QA,
  SYSTEM_INSTRUCTION_DEV,
  sanitizeAgentResponse,
} from "./prompts";
import { parseAllMarkdownTables } from "../utils/markdown";
import { generateExcelFromTables } from "../excel/generator";
import { createAnswerBlocks, createProgressBlock, createTaskCreatedCard } from "../slack/blocks";
import { INITIAL_SLACK_TO_PLANE_USERS, resolvePlaneUserId } from "../slack/user-mapping";
import { checkDuplicatePlaneIssues } from "../plane/duplicates";
import { buildPlaneBugHtmlDescription } from "../plane/task-builder";
import {
  resolvePlaneProject,
  setChannelDefaultProject,
  getChannelDefaultProject,
  formatProjectsListBlocks,
} from "../plane/projects";
import { extractTaskFromThread } from "../ai/task-extractor";
import { runSrsCodeAudit } from "../audit/srs-code-auditor";

export const CODE_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "search_codebase",
    description:
      "Tìm kiếm các file code hoặc biểu thức logic trong repository bằng từ khóa kỹ thuật tiếng Anh.",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo hoặc alias: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        query: {
          type: "STRING",
          description: "Từ khóa code tiếng Anh, tên class, hàm, model.",
        },
      },
      required: ["repo", "query"],
    },
  },
  {
    name: "read_code_file",
    description: "Đọc nội dung của một file code cụ thể từ GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        filePath: {
          type: "STRING",
          description: "Đường dẫn file (ví dụ: 'apps/accounting/services/sales_invoice_service.py').",
        },
        startLine: {
          type: "INTEGER",
          description: "Dòng bắt đầu (1-indexed).",
        },
        endLine: {
          type: "INTEGER",
          description: "Dòng kết thúc.",
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
          description: "Tiền tố thư mục cần duyệt.",
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
  private plane?: PlaneClient;
  private clickup?: ClickUpClient;
  private github?: GitHubClient;

  constructor(env: Env) {
    this.env = env;
    this.slack = new SlackClient(env.SLACK_BOT_TOKEN);
    this.srsSearch = new SrsSearchService(env);
    const planeKey = env.PLANE_API_KEY || "plane_api_dfeaa88d10704e32a1d15e45d0006318";
    if (planeKey) {
      this.plane = new PlaneClient(
        planeKey,
        env.PLANE_API_HOST_URL || "https://pm.glinteco.com",
        env.PLANE_WORKSPACE_SLUG || "glinteco"
      );
    }
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

    const progressMsg = await this.slack.postMessage(
      channelId,
      "⏳ Đang xử lý yêu cầu...",
      {
        thread_ts: targetThreadTs || undefined,
        blocks: createProgressBlock(1, 2, "Đang kiểm tra thông tin nghiệp vụ..."),
      }
    );

    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("TIMEOUT_22S"));
      }, 22000);
    });

    try {
      await Promise.race([
        this.processQuery({
          channelId,
          targetThreadTs,
          userId,
          query,
          history: params.history,
          progressMsgTs: progressMsg.ts,
        }),
        timeoutPromise,
      ]);
    } catch (err: any) {
      console.error("Lỗi xử lý Agent:", err);
      const isTimeout = err?.message === "TIMEOUT_22S";
      const errorMsg = isTimeout
        ? "⏱️ *Yêu cầu xử lý quá thời gian cho phép.* Bạn vui lòng thử lại với câu hỏi ngắn gọn hơn nhé!"
        : `⚠️ *Chưa thể hoàn tất yêu cầu:* ${err.message || String(err)}`;

      await this.slack.updateMessage(channelId, progressMsg.ts, errorMsg, {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: errorMsg,
            },
          },
        ],
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async processQuery(params: {
    channelId: string;
    targetThreadTs: string;
    userId: string;
    query: string;
    history?: any[];
    progressMsgTs: string;
  }): Promise<void> {
    const { channelId, targetThreadTs, userId, query, history, progressMsgTs } = params;

    const intent = classifyIntent(query);
    const techMode = isTechRequested(query);

    // 1. XEM DANH SÁCH PROJECT PLANE
    if (intent === "LIST_PROJECTS") {
      await this.handleListProjects(channelId, targetThreadTs, progressMsgTs);
      return;
    }

    // 2. GÁN DEFAULT PROJECT CHO CHANNEL
    if (intent === "SET_PROJECT") {
      await this.handleSetProject(channelId, targetThreadTs, query, progressMsgTs);
      return;
    }

    // 3. AUDIT SRS VỚI CODE VÀ BÁO CÁO
    if (intent === "AUDIT_SRS_CODE") {
      await this.handleAuditSrsCode(channelId, targetThreadTs, query, progressMsgTs);
      return;
    }

    // 4. TẠO TASK NHANH TRÊN PLANE (TỪ TIN NHẮN ĐƠN HOẶC THREAD)
    if (intent === "CREATE_TASK") {
      await this.handleCreateTaskFromThread(channelId, targetThreadTs, userId, progressMsgTs, query);
      return;
    }

    // 5. TRA CỨU BUG/TASK TRÊN PLANE
    if (intent === "SEARCH_PLANE" || intent === "SEARCH_CLICKUP") {
      await this.handleSearchPlane(channelId, targetThreadTs, query, progressMsgTs);
      return;
    }

    // 6. Tra cứu tài liệu SRS + Logic hệ thống (ngầm hoặc chi tiết tùy techMode)
    // Nếu đang ở trong thread và câu hỏi ngắn (ví dụ: "check code xem ở đâu?"), kết hợp câu hỏi trước đó trong thread để tìm đúng phân hệ
    const prevUserText =
      history && history.length > 0
        ? history
            .filter((m: any) => !m.bot_id)
            .slice(-2)
            .map((m: any) => (m.text || "").replace(/<@[A-Z0-9]+>/g, "").trim())
            .join(" ")
        : "";
    const baseLookupQuery = prevUserText ? `${prevUserText} ${query}` : query;

    let planeTaskContext = "";
    let planeEnrichedTerms = "";
    if (this.plane) {
      const resolved = await this.plane.resolveIssueReferencesFromText(baseLookupQuery);
      planeTaskContext = resolved.planeContext;
      planeEnrichedTerms = resolved.enrichedTerms;
    }

    const lookupQuery = `${baseLookupQuery} ${planeEnrichedTerms}`.trim();

    const srsResults = await this.srsSearch.search(lookupQuery, 6);
    let srsContext = planeTaskContext;
    if (srsResults.length > 0) {
      srsContext += "\n\n=== TÀI LIỆU SRS THAM CHIẾU ===\n";
      srsResults.forEach((r, idx) => {
        srsContext += `\n[Tài liệu ${idx + 1}: ${r.docId} | Đề mục: ${r.heading}]\n${r.content}\n`;
      });
    }

    // Luôn nạp ngữ cảnh logic hệ thống để câu trả lời chính xác 100%,
    // nhưng chỉ nạp mã nguồn/tên file khi techMode === true
    const codeContext = await getSmartCodeContext(lookupQuery, this.github, {
      allowTech: techMode,
    });

    let systemInstruction = SYSTEM_INSTRUCTION_DEFAULT;
    if (intent === "BA") {
      systemInstruction = SYSTEM_INSTRUCTION_BA;
    } else if (intent === "QA") {
      systemInstruction = SYSTEM_INSTRUCTION_QA;
    } else if (techMode) {
      systemInstruction = SYSTEM_INSTRUCTION_DEV;
    }

    const contents: GeminiContent[] = [];
    if (history && history.length > 0) {
      for (const msg of history.slice(-6)) {
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

    const useWorkersAi = this.env.AI_PROVIDER === "cloudflare" || !this.env.GEMINI_API_KEY;
    const aiClient =
      useWorkersAi && this.env.AI ? new WorkersAiClient(this.env) : new GeminiClient(this.env);

    // Chỉ bật công cụ tìm kiếm code trực tiếp khi người dùng yêu cầu "check code" (techMode) và chưa có codeContext
    const tools =
      techMode && !codeContext && this.github
        ? [{ functionDeclarations: CODE_TOOLS }]
        : undefined;
    let rawResponseText = "";
    const maxTurns = tools ? 2 : 1;
    let currentTurn = 0;

    while (currentTurn < maxTurns) {
      currentTurn++;
      const isFinalTurn = currentTurn === maxTurns;
      const activeTools = isFinalTurn ? undefined : tools;

      const aiResponse = await aiClient.generateContent({
        contents,
        systemInstruction,
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
              const searchRes = await this.github.searchCode(repo, q);
              toolResult = JSON.stringify(searchRes);
            } else if (call.name === "read_code_file") {
              const repo = call.args.repo || "backend";
              const filePath = call.args.filePath || "";
              const fileRes = await this.github.readFile(repo, filePath, {
                startLine: call.args.startLine,
                endLine: call.args.endLine || (call.args.startLine ? call.args.startLine + 100 : 120),
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
            toolResult = `Error: ${toolErr.message || String(toolErr)}`;
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
        rawResponseText = aiResponse.text;
        break;
      }
    }

    // Lọc hậu xử lý để đảm bảo ngắn gọn & khử 100% thuật ngữ tech khi ở chế độ Business
    const responseText = sanitizeAgentResponse(rawResponseText, techMode);

    // Kiểm tra xuất Excel nếu là BA / QA và có bảng Markdown
    const tables = parseAllMarkdownTables(responseText);
    let excelData: any = null;

    if (tables.length > 0 && (intent === "BA" || intent === "QA")) {
      try {
        excelData = await generateExcelFromTables(tables, query);
      } catch (excelErr) {
        console.error("Lỗi tạo file Excel:", excelErr);
      }
    }

    const answerBlocks = createAnswerBlocks(responseText, {
      hasExcel: !!excelData,
      excelFileName: excelData?.filename,
      isUsecase: intent === "BA",
      isUat: intent === "QA",
    });

    await this.slack.updateMessage(channelId, progressMsgTs, responseText, {
      blocks: answerBlocks,
    });

    if (excelData) {
      try {
        await this.slack.uploadFileV2(
          channelId,
          excelData.buffer,
          excelData.filename,
          excelData.isUsecase ? "Danh sách UseCase" : "Kịch bản UAT",
          `📊 File Excel đính kèm (${excelData.filename}):`,
          targetThreadTs
        );

        if (this.env.R2) {
          const r2Key = `exports/${Date.now()}_${excelData.filename}`;
          await this.env.R2.put(r2Key, excelData.buffer);
        }
      } catch (uploadErr) {
        console.error("Lỗi upload file Excel:", uploadErr);
      }
    }
  }

  private async handleAuditSrsCode(
    channelId: string,
    _threadTs: string,
    query: string,
    progressMsgTs: string
  ): Promise<void> {
    const report = await runSrsCodeAudit({
      query,
      srsSearch: this.srsSearch,
      github: this.github,
    });

    await this.slack.updateMessage(channelId, progressMsgTs, report.markdownSummary, {
      blocks: report.slackBlocks,
    });
  }

  private async handleListProjects(
    channelId: string,
    _threadTs: string,
    progressMsgTs: string
  ): Promise<void> {
    const currentChannelProj = await getChannelDefaultProject(channelId, this.env);
    const blocks = formatProjectsListBlocks(currentChannelProj);
    await this.slack.updateMessage(channelId, progressMsgTs, "Danh sách Project trên Plane:", {
      blocks,
    });
  }

  private async handleSetProject(
    channelId: string,
    _threadTs: string,
    query: string,
    progressMsgTs: string
  ): Promise<void> {
    const parts = query
      .replace(/^\/set[-_]project/i, "")
      .replace(/^set\s+project/i, "")
      .replace(/^đổi\s+project/i, "")
      .replace(/^chọn\s+project/i, "")
      .replace(/^gán\s+project\s+mặc\s+định/i, "")
      .replace(/^đặt\s+project\s+mặc\s+định/i, "")
      .trim();

    if (!parts) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Bạn vui lòng nhập mã Project cần gán (ví dụ: `@bot set project CRM` hoặc `@bot set project MVLCTV`)."
      );
      return;
    }

    const matchedProj = await setChannelDefaultProject(channelId, parts, this.env);
    if (!matchedProj) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        `⚠️ Không tìm thấy project *"${parts}"*. Gõ \`@bot projects\` để xem danh sách hợp lệ nhé.`
      );
      return;
    }

    await this.slack.updateMessage(
      channelId,
      progressMsgTs,
      `✅ Đã đặt project mặc định của kênh thành *${matchedProj.name}* (\`${matchedProj.identifier}\`).`
    );
  }

  private async handleCreateTaskFromThread(
    channelId: string,
    threadTs: string,
    slackUserId: string,
    progressMsgTs: string,
    commandQuery?: string
  ): Promise<void> {
    if (!this.plane) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Chưa cấu hình Plane API Key trong môi trường."
      );
      return;
    }

    // 1. Lấy tin nhắn từ thread (hoặc tạo nhanh trực tiếp từ câu lệnh đơn lẻ nếu không ở trong thread)
    let messages: any[] = [];
    if (threadTs) {
      try {
        messages = (await this.slack.getConversationReplies(channelId, threadTs)) || [];
      } catch (e) {
        console.warn("Could not fetch replies, using direct commandQuery:", e);
      }
    }

    if (messages.length === 0 && commandQuery) {
      messages = [{ user: slackUserId, text: commandQuery, ts: threadTs || `${Date.now()}` }];
    }

    if (messages.length === 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Bạn vui lòng nhập mô tả công việc/lỗi hoặc tag mình trong thread cần tạo task nhé!"
      );
      return;
    }

    // 2. Xác định dự án mục tiêu
    const userMessagesText = messages
      .filter((m) => !m.bot_id && m.subtype !== "bot_message")
      .map((m) => m.text || "")
      .join(" ");

    const targetProject = await resolvePlaneProject({
      text: `${commandQuery || ""} ${userMessagesText}`,
      channelId,
      env: this.env,
      planeClient: this.plane,
    });
    const projectId = targetProject.id;
    const projectIdentifier = targetProject.identifier;

    // 3. Trích xuất nội dung Task / Bug
    const useWorkersAi = this.env.AI_PROVIDER === "cloudflare" || !this.env.GEMINI_API_KEY;
    const aiClient =
      useWorkersAi && this.env.AI ? new WorkersAiClient(this.env) : new GeminiClient(this.env);

    const taskJson = await extractTaskFromThread({
      messages,
      threadTs,
      query: commandQuery || "",
      aiClient,
    });

    // 4. Phân giải người phụ trách (Assignees)
    const userMatch = await resolvePlaneUserId(
      slackUserId,
      this.slack,
      this.env,
      this.plane,
      projectId
    );

    const mentionRegex = /<@([A-Z0-9]+)>/g;
    const candidateSlackUserIds = new Set<string>();

    for (const msg of messages) {
      if (msg.text) {
        let match: RegExpExecArray | null;
        while ((match = mentionRegex.exec(msg.text)) !== null) {
          const mentionedId = match[1];
          if (mentionedId && mentionedId !== slackUserId) {
            candidateSlackUserIds.add(mentionedId);
          }
        }
      }
    }

    const resolvedAssignees: { id: string; name: string }[] = [];

    for (const mSlackId of candidateSlackUserIds) {
      const resolved = await resolvePlaneUserId(
        mSlackId,
        this.slack,
        this.env,
        this.plane,
        projectId
      );
      if (resolved.id && !resolvedAssignees.some((a) => a.id === resolved.id)) {
        resolvedAssignees.push({ id: resolved.id, name: resolved.name });
      }
    }

    // Nếu người dùng gõ tên/handle trực tiếp (vd: "giao @ducpm", "cho phuongkt")
    if (resolvedAssignees.length === 0 && taskJson.explicitAssignee) {
      const explicitKey = taskJson.explicitAssignee.toLowerCase().replace(/^@/, "").trim();
      const staticId = INITIAL_SLACK_TO_PLANE_USERS[explicitKey];
      if (staticId) {
        resolvedAssignees.push({ id: staticId, name: taskJson.explicitAssignee });
      }
    }

    if (resolvedAssignees.length === 0 && userMatch.id) {
      resolvedAssignees.push({ id: userMatch.id, name: userMatch.name });
    }

    const assigneeIds = resolvedAssignees.map((a) => a.id);
    const assigneeDisplayNames = resolvedAssignees
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");

    // 5. Kiểm tra trùng lặp trên Plane
    const duplicateCheck = await checkDuplicatePlaneIssues(
      this.plane,
      projectId,
      taskJson.taskName,
      projectIdentifier
    );
    let duplicateWarning = "";
    if (duplicateCheck.hasDuplicate) {
      const dup = duplicateCheck.duplicateIssues[0];
      const dupDisplay = dup.sequenceId
        ? `${projectIdentifier}-${dup.sequenceId}`
        : dup.id.slice(0, 8);
      duplicateWarning = `⚠️ *Task tương tự đã có:* <${dup.url}|[${dupDisplay}] ${dup.name}> (${dup.state})`;
    }

    // 6. Thu thập file đính kèm
    const evidenceFiles: { name: string; url: string }[] = [];
    for (const msg of messages) {
      if (msg.files && Array.isArray(msg.files)) {
        for (const f of msg.files) {
          if (f.url_private) {
            evidenceFiles.push({
              name: f.name || "Tệp đính kèm Slack",
              url: f.permalink || f.url_private,
            });
          }
        }
      }
    }

    // 7. Tạo mô tả HTML ngắn gọn trên Plane
    const slackThreadUrl = threadTs
      ? `https://slack.com/app_redirect?channel=${channelId}&thread_ts=${threadTs}`
      : undefined;
    const descriptionHtml = buildPlaneBugHtmlDescription({
      taskType: taskJson.taskType,
      moduleName: taskJson.moduleName,
      environment: "Staging",
      deviceInfo: "Web / App",
      severity: taskJson.severity,
      stepsToReproduce: taskJson.stepsToReproduce || [],
      actualBehavior: taskJson.actualBehavior,
      expectedBehavior: taskJson.expectedBehavior,
      slackThreadUrl,
      evidenceFiles,
    });

    // 8. Lấy default state & tạo issue trên Plane
    let stateId: string | undefined = undefined;
    try {
      const states = await this.plane.getProjectStates(projectId);
      const defaultState =
        states.find((s) => s.default) ||
        states.find((s) => s.group === "backlog") ||
        states.find((s) => s.group === "unstarted") ||
        states[0];
      if (defaultState) {
        stateId = defaultState.id;
      }
    } catch (stateErr) {
      console.warn("Lỗi lấy default state:", stateErr);
    }

    const createdIssue = await this.plane.createIssue(projectId, {
      name: taskJson.taskName,
      description_html: descriptionHtml,
      priority: taskJson.severity,
      state: stateId,
      assignees: assigneeIds.length > 0 ? assigneeIds : undefined,
    });

    if (evidenceFiles.length > 0) {
      try {
        const commentHtml = `<p>📎 <strong>Đính kèm từ Slack:</strong></p><ul>${evidenceFiles
          .map((f) => `<li><a href="${f.url}" target="_blank">${f.name}</a></li>`)
          .join("")}</ul>`;
        await this.plane.addIssueComment(projectId, createdIssue.id, commentHtml);
      } catch {}
    }

    const issueUrl = this.plane.getIssueWebUrl(
      projectId,
      createdIssue.id,
      projectIdentifier,
      createdIssue.sequence_id
    );
    const displayId = createdIssue.sequence_id
      ? `${projectIdentifier}-${createdIssue.sequence_id}`
      : createdIssue.id.slice(0, 8);

    const cardBlocks = createTaskCreatedCard({
      id: createdIssue.id,
      displayId,
      name: createdIssue.name,
      url: issueUrl,
      assigneeName: assigneeDisplayNames || userMatch.name || "Chưa gán",
      priority: taskJson.severity,
      status: "Backlog",
      systemName: "Plane",
      projectName: `${targetProject.name} (\`${targetProject.identifier}\`)`,
      attachmentsCount: evidenceFiles.length,
    });

    if (duplicateWarning) {
      cardBlocks.splice(1, 0, {
        type: "context",
        elements: [{ type: "mrkdwn", text: duplicateWarning }],
      });
    }

    await this.slack.updateMessage(channelId, progressMsgTs, `✅ Đã tạo task [${displayId}]`, {
      blocks: cardBlocks,
    });
  }

  private async handleSearchPlane(
    channelId: string,
    _threadTs: string,
    query: string,
    progressMsgTs: string
  ): Promise<void> {
    if (!this.plane) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Chưa cấu hình Plane API Key."
      );
      return;
    }

    const cleanKeyword = query
      .replace(/^\/?(?:bugs?|tasks?|plane[-_]bugs?|plane[-_]tasks?)\s*/i, "")
      .replace(/^(?:tìm|tra cứu|xem|danh sách)\s+(?:bug|task|lỗi)\s*/i, "")
      .trim();

    const targetProject = await resolvePlaneProject({
      text: query,
      channelId,
      env: this.env,
      planeClient: this.plane,
    });
    const projectId = targetProject.id;
    const projectIdentifier = targetProject.identifier;

    const issues = await this.plane.searchIssues(projectId, cleanKeyword, false);

    if (issues.length === 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        `🔍 Không tìm thấy task/bug nào khớp với *"${cleanKeyword || query}"* trên dự án \`${projectIdentifier}\`.`
      );
      return;
    }

    let reply = `🔍 *Kết quả trên Plane (${issues.length} task - \`${projectIdentifier}\`):*\n`;
    issues.slice(0, 6).forEach((issue) => {
      const issueUrl = this.plane!.getIssueWebUrl(
        projectId,
        issue.id,
        projectIdentifier,
        issue.sequence_id
      );
      const displayId = issue.sequence_id
        ? `${projectIdentifier}-${issue.sequence_id}`
        : issue.id.slice(0, 8);
      const stateName = issue.state_detail?.name || "Open";
      reply += `• <${issueUrl}|[${displayId}]> *${issue.name}* — \`${stateName}\`\n`;
    });

    await this.slack.updateMessage(channelId, progressMsgTs, reply.trim());
  }
}
