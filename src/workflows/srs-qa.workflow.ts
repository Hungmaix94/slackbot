import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import { SrsSearchService, SearchResult } from "../rag/search";
import { GitHubClient } from "../github/client";
import { AgentIntent } from "../agents/router";
import { getSmartCodeContext } from "../agents/code-context";
import {
  SYSTEM_INSTRUCTION_DEFAULT,
  SYSTEM_INSTRUCTION_BA,
  SYSTEM_INSTRUCTION_QA,
  SYSTEM_INSTRUCTION_DEV,
} from "../agents/prompts";
import { GeminiContent } from "../ai/gemini";
import { createAiClient } from "../core/ai-client-factory";
import { AgentRunner } from "../core/agent-runner";
import { CODE_TOOLS, executeCodeTool } from "../tools/code-tools";
import { parseAllMarkdownTables } from "../utils/markdown";
import { generateExcelFromTables } from "../excel/generator";
import { createAnswerBlocks, createProgressBlock } from "../slack/blocks";
import { AgentRunnerResult } from "../core/types";

export interface SrsQaExecutionResult extends AgentRunnerResult {
  query: string;
  intent: AgentIntent;
  provider: string;
  model: string;
  srsResults: SearchResult[];
}

export class SrsQaWorkflow {
  constructor(
    private env: Env,
    private srsSearch: SrsSearchService,
    private slack?: SlackClient,
    private github?: GitHubClient
  ) {}

  /**
   * Chuẩn bị context RAG và system instruction theo intent
   */
  async prepareContext(query: string, intent: AgentIntent) {
    const srsResults = await this.srsSearch.search(query, 5);
    let srsContext = "";
    if (srsResults.length > 0) {
      srsContext = "\n\n=== TÀI LIỆU SRS THAM CHIẾU TỪ HỆ THỐNG ===\n";
      srsResults.forEach((r, idx) => {
        srsContext += `\n[Tài liệu ${idx + 1}: ${r.docId} | Đề mục: ${r.heading}]\n${r.content}\n`;
      });
    } else {
      srsContext = "\n\n[Thông báo: Không tìm thấy tài liệu SRS tương ứng trong cơ sở dữ liệu]";
    }

    let systemInstruction = SYSTEM_INSTRUCTION_DEFAULT;
    if (intent === "BA") systemInstruction = SYSTEM_INSTRUCTION_BA;
    if (intent === "QA") systemInstruction = SYSTEM_INSTRUCTION_QA;

    let codeContext = "";
    if (this.github) {
      codeContext = await getSmartCodeContext(query, this.github);
    }

    let needsCodeTools = false;
    if (intent === "CODE_DEV" || codeContext) {
      systemInstruction = SYSTEM_INSTRUCTION_DEV;
      needsCodeTools = true;
    }

    return {
      srsResults,
      srsContext,
      codeContext,
      systemInstruction,
      needsCodeTools,
    };
  }

  /**
   * Xây dựng mảng contents cho AI, làm sạch tag mention và pseudo-tool calls
   */
  buildContents(query: string, srsContext: string, codeContext: string, history?: any[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    if (history && history.length > 0) {
      for (const msg of history.slice(-6)) {
        const role = msg.bot_id ? "model" : "user";
        let text = (msg.text || "")
          .replace(/<@[A-Z0-9_]+(?:\|[^>]+)?>/gi, "")
          .replace(/<![a-zA-Z0-9_]+>/g, "")
          .trim();
        if (role === "model") {
          text = AgentRunner.cleanHallucinations(text);
        }
        if (text) {
          contents.push({ role, parts: [{ text }] });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: `${query}\n\n${srsContext}${codeContext}` }],
    });

    return contents;
  }

  /**
   * Thực thi trực tiếp không qua Slack UI (dùng cho /test/query hoặc service call)
   */
  async executeDirect(params: {
    query: string;
    intent: AgentIntent;
    history?: any[];
  }): Promise<SrsQaExecutionResult> {
    const { query, intent, history } = params;
    const { srsResults, srsContext, codeContext, systemInstruction } =
      await this.prepareContext(query, intent);

    const contents = this.buildContents(query, srsContext, codeContext, history);
    const aiInstance = createAiClient(this.env);

    const tools = codeContext ? undefined : (this.github ? CODE_TOOLS : undefined);
    const toolDispatcher = this.github
      ? (call: any) => executeCodeTool(this.github!, call)
      : undefined;

    const runnerResult = await AgentRunner.run({
      aiClient: aiInstance.client,
      contents,
      systemInstruction,
      tools,
      toolDispatcher,
    });

    return {
      ...runnerResult,
      query,
      intent,
      provider: aiInstance.provider,
      model: aiInstance.model,
      srsResults,
    };
  }

  /**
   * Thực thi toàn bộ luồng nghiệp vụ trên Slack (tiến trình, agent run, excel, trả lời)
   */
  async handleQuery(params: {
    channelId: string;
    targetThreadTs: string;
    query: string;
    intent: AgentIntent;
    progressMsgTs: string;
    history?: any[];
  }): Promise<void> {
    if (!this.slack) {
      throw new Error("SlackClient is required to run Slack workflow");
    }

    const { channelId, targetThreadTs, query, intent, progressMsgTs, history } = params;

    // 1. Cập nhật tiến trình tra cứu SRS
    await this.slack.updateMessage(
      channelId,
      progressMsgTs,
      "⏳ Đang tra cứu tài liệu SRS...",
      {
        blocks: createProgressBlock(2, 3, "Đang đối chiếu tài liệu SRS & lịch sử hội thoại..."),
      }
    );

    const { srsResults, srsContext, codeContext, systemInstruction, needsCodeTools } =
      await this.prepareContext(query, intent);

    if (needsCodeTools && !this.github) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Tính năng tra cứu mã nguồn yêu cầu cấu hình `GITHUB_TOKEN`. Bạn vui lòng cấu hình secret: `npx wrangler secret put GITHUB_TOKEN`."
      );
      return;
    }

    if (codeContext) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⏳ [Code Agent] Đã nạp trực tiếp mã nguồn backend liên quan, đang phân tích logic...",
        {
          blocks: createProgressBlock(2, 3, "Đã đọc trực tiếp mã nguồn backend, đang mổ xẻ nguyên nhân..."),
        }
      );
    }

    // 2. Chạy Agent Runner
    const contents = this.buildContents(query, srsContext, codeContext, history);
    const aiInstance = createAiClient(this.env);

    const tools = codeContext ? undefined : (this.github ? CODE_TOOLS : undefined);
    const toolDispatcher = this.github
      ? (call: any) => executeCodeTool(this.github!, call)
      : undefined;

    const runnerResult = await AgentRunner.run({
      aiClient: aiInstance.client,
      contents,
      systemInstruction,
      tools,
      toolDispatcher,
    });

    const responseText = runnerResult.response;

    // 3. Kiểm tra xem có bảng Markdown cần xuất Excel không
    const tables = parseAllMarkdownTables(responseText);
    let excelData: any = null;

    if (tables.length > 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
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

    // 4. Cập nhật câu trả lời chính thức bằng Block Kit
    const answerBlocks = createAnswerBlocks(responseText, {
      hasExcel: !!excelData,
      excelFileName: excelData?.filename,
      isUsecase: intent === "BA",
      isUat: intent === "QA",
    });

    await this.slack.updateMessage(channelId, progressMsgTs, responseText, {
      blocks: answerBlocks,
    });

    // 5. Nếu có file Excel, upload trực tiếp lên Slack
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

        if (this.env.R2) {
          const r2Key = `exports/${Date.now()}_${excelData.filename}`;
          await this.env.R2.put(r2Key, excelData.buffer);
        }
      } catch (uploadErr) {
        console.error("Lỗi khi upload file Excel lên Slack:", uploadErr);
      }
    }
  }
}
