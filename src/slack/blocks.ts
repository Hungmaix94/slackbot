import { markdownToSlackLinks } from "../utils/markdown";

export function createProgressBlock(_step: number, _total: number, message: string): any[] {
  return [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `⏳ _${message}_`,
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
  const safeText = text && text.trim().length > 0 ? text.trim() : "Mình chưa tìm thấy thông tin phù hợp cho yêu cầu này.";
  const slackText = markdownToSlackLinks(safeText);

  // Chia nhỏ text nếu vượt quá 2800 ký tự (giới hạn một block text của Slack là 3000)
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

  // Interactive buttons gọn nhẹ
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
      text: "🐛 Tạo Task Plane",
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
  priority?: string;
  attachmentsCount?: number;
  systemName?: string;
  projectName?: string;
}): any[] {
  const system = task.systemName || "Plane";
  const displayId = task.displayId || task.id.slice(0, 8);
  const projectLabel = task.projectName || "MVLCTV";
  const assigneeLabel = task.assigneeName || "Chưa gán";
  const priorityLabel = (task.priority || "high").toUpperCase();
  const attachNote =
    task.attachmentsCount && task.attachmentsCount > 0
      ? ` | *Đính kèm:* ${task.attachmentsCount} tệp`
      : "";

  const summaryText =
    `✅ *Đã tạo task ${system}:* <${task.url}|[${displayId}] ${task.name}>\n` +
    `• *Dự án:* ${projectLabel} | *Ưu tiên:* \`${priorityLabel}\` | *Giao cho:* ${assigneeLabel}${attachNote}`;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: summaryText,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: `🔗 Mở trên ${system}`,
            emoji: true,
          },
          url: task.url,
          style: "primary",
        },
      ],
    },
  ];
}
