import { Env } from "../config/env";
import { SlackClient } from "../slack/client";
import {
  getChannelDefaultProject,
  setChannelDefaultProject,
  formatProjectsListBlocks,
} from "../plane/projects";

export class ProjectConfigWorkflow {
  constructor(private env: Env, private slack: SlackClient) {}

  async handleList(params: {
    channelId: string;
    progressMsgTs: string;
  }): Promise<void> {
    const { channelId, progressMsgTs } = params;
    const currentChannelProj = await getChannelDefaultProject(channelId, this.env);
    const blocks = formatProjectsListBlocks(currentChannelProj);
    await this.slack.updateMessage(channelId, progressMsgTs, "Danh sách Project trên Plane:", {
      blocks,
    });
  }

  async handleSet(params: {
    channelId: string;
    query: string;
    progressMsgTs: string;
  }): Promise<void> {
    const { channelId, query, progressMsgTs } = params;

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
        "⚠️ Vui lòng cung cấp mã hoặc tên Project bạn muốn gán.\nVí dụ: `@bot set project CRM` hoặc `@bot set project MVLGO`."
      );
      return;
    }

    const matchedProj = await setChannelDefaultProject(channelId, parts, this.env);
    if (!matchedProj) {
      await this.slack.updateMessage(
        channelId,
        progressMsgTs,
        `⚠️ Không tìm thấy project nào khớp với từ khóa *"${parts}"*.\nHãy gõ \`@bot projects\` để xem danh sách project hợp lệ.`
      );
      return;
    }

    await this.slack.updateMessage(
      channelId,
      progressMsgTs,
      `✅ Đã đặt project mặc định cho kênh này thành *${matchedProj.name}* (\`${matchedProj.identifier}\`).\nTừ bây giờ mọi bug/task tạo trong kênh này sẽ mặc định được tạo trên project này!`
    );
  }
}
