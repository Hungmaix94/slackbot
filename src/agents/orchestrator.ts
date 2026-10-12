import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import { SrsSearchService } from "../rag/search";
import { ClickUpClient } from "../clickup/client";
import { PlaneClient } from "../plane/client";
import { GitHubClient } from "../github/client";
import { classifyIntent } from "./router";
import {
  SrsQaWorkflow,
  TaskCreatorWorkflow,
  PlaneSearchWorkflow,
  ProjectConfigWorkflow,
} from "../workflows";

// Re-export CODE_TOOLS for backward compatibility
export { CODE_TOOLS } from "../tools/code-tools";

export class AgentOrchestrator {
  private env: Env;
  private slack: SlackClient;
  private srsSearch: SrsSearchService;
  private plane?: PlaneClient;
  private clickup?: ClickUpClient;
  private github?: GitHubClient;

  // Workflows
  private srsQaWorkflow: SrsQaWorkflow;
  private taskCreatorWorkflow: TaskCreatorWorkflow;
  private planeSearchWorkflow: PlaneSearchWorkflow;
  private projectConfigWorkflow: ProjectConfigWorkflow;

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

    // Khởi tạo các workflow chuyên biệt
    this.projectConfigWorkflow = new ProjectConfigWorkflow(env, this.slack);
    this.planeSearchWorkflow = new PlaneSearchWorkflow(env, this.slack, this.plane);
    this.taskCreatorWorkflow = new TaskCreatorWorkflow(env, this.slack, this.plane);
    this.srsQaWorkflow = new SrsQaWorkflow(env, this.srsSearch, this.slack, this.github);
  }

  /**
   * Facade tiếp nhận query từ Slack và điều phối tới đúng workflow
   */
  async handleQuery(params: {
    channelId: string;
    threadTs: string;
    userId: string;
    query: string;
    history?: any[];
  }): Promise<void> {
    const { channelId, threadTs, userId, query, history } = params;
    const targetThreadTs = threadTs;

    // 1. Gửi tin nhắn tiến trình đầu tiên
    const progressMsg = await this.slack.postMessage(
      channelId,
      "⏳ Đang khởi động phân tích yêu cầu...",
      {
        thread_ts: targetThreadTs,
      }
    );

    const progressMsgTs = progressMsg.ts;

    try {
      const intent = classifyIntent(query);

      // XỬ LÝ INTENT: XEM DANH SÁCH PROJECT PLANE
      if (intent === "LIST_PROJECTS") {
        await this.projectConfigWorkflow.handleList({ channelId, progressMsgTs });
        return;
      }

      // XỬ LÝ INTENT: GÁN DEFAULT PROJECT CHO CHANNEL
      if (intent === "SET_PROJECT") {
        await this.projectConfigWorkflow.handleSet({ channelId, query, progressMsgTs });
        return;
      }

      // XỬ LÝ INTENT: TẠO TASK TRÊN PLANE TỪ THREAD
      if (intent === "CREATE_TASK") {
        await this.taskCreatorWorkflow.handleCreateFromThread({
          channelId,
          threadTs: targetThreadTs,
          slackUserId: userId,
          progressMsgTs,
          commandQuery: query,
        });
        return;
      }

      // XỬ LÝ INTENT: TRA CỨU BUG TRÊN PLANE
      if (intent === "SEARCH_PLANE" || intent === "SEARCH_CLICKUP") {
        await this.planeSearchWorkflow.handleSearch({ channelId, query, progressMsgTs });
        return;
      }

      // MẶC ĐỊNH: Luồng hỏi đáp SRS RAG & Code Drift & xuất Excel
      await this.srsQaWorkflow.handleQuery({
        channelId,
        targetThreadTs,
        query,
        intent,
        progressMsgTs,
        history,
      });
    } catch (err: any) {
      console.error("Lỗi trong quá trình xử lý Agent Orchestrator:", err);
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        `❌ Đã xảy ra lỗi khi xử lý: ${err.message || String(err)}`
      );
    }
  }

  // Expose workflow cho các service hoặc route khác tái sử dụng
  getSrsQaWorkflow(): SrsQaWorkflow {
    return this.srsQaWorkflow;
  }
}
