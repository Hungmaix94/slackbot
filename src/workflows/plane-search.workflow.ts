import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import { PlaneClient } from "../plane/client";

export class PlaneSearchWorkflow {
  constructor(
    private env: Env,
    private slack: SlackClient,
    private plane?: PlaneClient
  ) {}

  async handleSearch(params: {
    channelId: string;
    query: string;
    progressMsgTs: string;
  }): Promise<void> {
    const { channelId, query, progressMsgTs } = params;

    if (!this.plane) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        "⚠️ Chưa cấu hình Plane API Key."
      );
      return;
    }

    const projectId =
      this.env.PLANE_DEFAULT_PROJECT_ID || "e92f7ba8-0db9-487f-a21c-13712d226eb8";
    const projectIdentifier = "MVLCTV";
    const issues = await this.plane.searchIssues(projectId, query, true);

    if (issues.length === 0) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        `🔍 Không tìm thấy bug/task nào liên quan đến từ khóa *"${query}"* trên Plane.`
      );
      return;
    }

    let reply = `🔍 *Tìm thấy ${issues.length} task/bug liên quan trên Plane:*\n\n`;
    issues.slice(0, 8).forEach((issue) => {
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
      reply += `- <${issueUrl}|[${displayId}]> *${issue.name}* (Trạng thái: \`${stateName}\`)\n`;
    });

    await this.slack.updateMessage(channelId, progressMsgTs, reply);
  }
}
