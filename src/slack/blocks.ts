import { markdownToSlackLinks } from "../utils/markdown";

export function createProgressBlock(step: number, total: number, message: string): any[] {
  const percent = Math.round((step / total) * 100);
  const progressBar = "▓".repeat(step) + "░".repeat(Math.max(0, total - step));

  return [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Tiến trình:* \`[${progressBar}] ${percent}%\` — *${message}*`,
        },
      ],
    },
  ];
}

export function createAnswerBlocks(
  text: string,
  options?: {
    hasExcel?: boolean;
    excelFileName?: string;
    isUsecase?: boolean;
    isUat?: boolean;
    clickupTerm?: string;
  }
): any[] {
  const blocks: any[] = [];
  const safeText = text && text.trim().length > 0 ? text : "Không có nội dung phản hồi từ hệ thống.";
  const slackText = markdownToSlackLinks(safeText);

  // Chia nhỏ text nếu vượt quá 3000 ký tự (giới hạn một block text của Slack)
  const chunkSize = 2800;
  for (let i = 0; i < slackText.length; i += chunkSize) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: slackText.substring(i, i + chunkSize),
      },
    });
  }

  if (blocks.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: slackText,
      },
    });
  }

  // Interactive buttons
  const actionElements: any[] = [];

  if (options?.hasExcel) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "📊 Tải Excel",
        emoji: true,
      },
      action_id: "download_excel",
      value: options.excelFileName || "export.xlsx",
      style: "primary",
    });
  }

  if (options?.isUat) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "➕ Thêm Kịch bản Biên",
        emoji: true,
      },
      action_id: "expand_edge_cases",
      value: "edge_cases",
    });
  }

  actionElements.push({
    type: "button",
    text: {
      type: "plain_text",
      text: "🐛 Tạo Bug Plane",
      emoji: true,
    },
    action_id: "create_plane_task",
    value: "create_task",
  });

  if (actionElements.length > 0) {
    blocks.push({
      type: "actions",
      elements: actionElements,
    });
  }

  return blocks;
}

export function createTaskCreatedCard(task: {
  id: string;
  displayId?: string;
  name: string;
  url: string;
  assigneeName?: string;
  status?: string;
  attachmentsCount?: number;
  systemName?: string;
}): any[] {
  const system = task.systemName || "Plane";
  const displayId = task.displayId || task.id;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🎉 *Đã tạo thành công task trên ${system} từ thread!*`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Mã Task:* <${task.url}|[${displayId}]>`,
        },
        {
          type: "mrkdwn",
          text: `*Người thực hiện:* ${task.assigneeName || "Chưa gán"}`,
        },
        {
          type: "mrkdwn",
          text: `*Tiêu đề:* ${task.name}`,
        },
        {
          type: "mrkdwn",
          text: `*Trạng thái:* ${task.status || "Backlog"}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: `🔗 Mở Task ${system}`,
            emoji: true,
          },
          url: task.url,
          style: "primary",
        },
      ],
    },
  ];
}
