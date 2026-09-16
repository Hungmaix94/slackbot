import { Env } from "../config/env";
import { PlaneClient } from "./client";

export interface PlaneProjectInfo {
  id: string;
  identifier: string;
  name: string;
  description?: string;
}

export const KNOWN_PLANE_PROJECTS: PlaneProjectInfo[] = [
  {
    id: "e92f7ba8-0db9-487f-a21c-13712d226eb8",
    identifier: "MVLCTV",
    name: "MaiVietLand Phase 3",
    description: "Hệ thống ERP MaiVietLand Phase 3 (Mặc định)",
  },
  {
    id: "ef79ee12-dbe4-415a-bc9f-6cf91ba944f2",
    identifier: "MVL",
    name: "MaiVietLand Phase 1 2",
    description: "Hệ thống ERP MaiVietLand Phase 1 & 2",
  },
  {
    id: "51d54abd-bb88-41de-b7f9-c9b335c34dda",
    identifier: "MVLGO",
    name: "MVL-GoLive",
    description: "Dự án vận hành triển khai Go-Live MaiVietLand",
  },
  {
    id: "87148fce-00c3-42c4-9369-a7af6cb9cc50",
    identifier: "MAIVIETLAN",
    name: "MaiVietLand Support",
    description: "Hỗ trợ & bảo hành vận hành MaiVietLand",
  },
  {
    id: "d696de1d-c7a2-4de3-9116-69b6165d3f1d",
    identifier: "CRM",
    name: "CRM",
    description: "Phân hệ Quản lý Khách hàng (CRM)",
  },
  {
    id: "3ba1f420-e341-4303-9c54-a0d241502c41",
    identifier: "DEVOPS",
    name: "Devops",
    description: "Hạ tầng, CI/CD, Server và Triển khai",
  },
  {
    id: "08e46aee-8c24-4bb3-9b91-d85f5ed362df",
    identifier: "GLINTECOWEBS",
    name: "Glinteco Website",
    description: "Website công ty Glinteco",
  },
  {
    id: "cf0566c2-1155-474c-9fd5-bf9f50eef3da",
    identifier: "DSTAX",
    name: "DsTax",
    description: "Hệ thống thuế DsTax",
  },
  {
    id: "16f47d68-0e36-4396-99eb-6683cef1815e",
    identifier: "FETEAMS",
    name: "FE teams",
    description: "Dự án nội bộ Frontend Teams",
  },
];

/**
 * Phân giải Project phù hợp cho yêu cầu:
 * 1. Từ khóa rõ ràng trong text (ví dụ: [CRM], project=MVL, bên GoLive, phase 1 2, v.v.)
 * 2. Cấu hình mặc định của Slack Channel (lưu trong KV)
 * 3. Cấu hình mặc định toàn cục trong env (PLANE_DEFAULT_PROJECT_ID)
 */
export async function resolvePlaneProject(params: {
  text?: string;
  channelId?: string;
  env: Env;
  planeClient?: PlaneClient;
}): Promise<PlaneProjectInfo> {
  const { text = "", channelId, env } = params;
  const textLower = text.toLowerCase();

  // 1. Kiểm tra từ khóa rõ ràng trong text (Ưu tiên các mã dài trước, ví dụ MVLCTV trước MVL)
  const sortedProjects = [...KNOWN_PLANE_PROJECTS].sort(
    (a, b) => b.identifier.length - a.identifier.length
  );

  for (const proj of sortedProjects) {
    const idLower = proj.identifier.toLowerCase();
    // Bắt các pattern: [MVLCTV], project=MVL, project: MVL, dự án MVL, #MVL
    const regex = new RegExp(`(?:\\[|project\\s*[:=]\\s*|dự\\s*án\\s+|#)${idLower}(?:\\]|\\b)`, "i");
    if (regex.test(text) || textLower.includes(`[${idLower}]`)) {
      return proj;
    }
  }

  // So khớp theo tên thông dụng (Ưu tiên Phase 3 trước)
  if (textLower.includes("phase 3") || textLower.includes("giai đoạn 3") || textLower.includes("mvlctv")) {
    const p = KNOWN_PLANE_PROJECTS.find((p) => p.identifier === "MVLCTV");
    if (p) return p;
  }
  if (textLower.includes("phase 1") || textLower.includes("phase 2") || textLower.includes("giai đoạn 1") || textLower.includes("giai đoạn 2")) {
    const p = KNOWN_PLANE_PROJECTS.find((p) => p.identifier === "MVL");
    if (p) return p;
  }
  if (textLower.includes("golive") || textLower.includes("go-live") || textLower.includes("go live")) {
    const p = KNOWN_PLANE_PROJECTS.find((p) => p.identifier === "MVLGO");
    if (p) return p;
  }
  if (textLower.includes("support") || textLower.includes("hỗ trợ")) {
    const p = KNOWN_PLANE_PROJECTS.find((p) => p.identifier === "MAIVIETLAN");
    if (p) return p;
  }
  if (textLower.includes("crm") || textLower.includes("khách hàng")) {
    const p = KNOWN_PLANE_PROJECTS.find((p) => p.identifier === "CRM");
    if (p) return p;
  }
  if (textLower.includes("devops") || textLower.includes("ci/cd") || textLower.includes("server") || textLower.includes("hạ tầng")) {
    const p = KNOWN_PLANE_PROJECTS.find((p) => p.identifier === "DEVOPS");
    if (p) return p;
  }

  // 2. Kiểm tra cấu hình channel default từ KV
  if (channelId) {
    try {
      const channelProjId = await env.KV.get(`channel_plane_project:${channelId}`);
      if (channelProjId) {
        const found = KNOWN_PLANE_PROJECTS.find(
          (p) => p.id === channelProjId || p.identifier.toLowerCase() === channelProjId.toLowerCase()
        );
        if (found) return found;
      }
    } catch (e) {
      console.warn("Lỗi đọc channel_plane_project từ KV:", e);
    }
  }

  // 3. Fallback: Dùng default từ env hoặc dự án đầu tiên (Phase 3)
  const defaultProjId = env.PLANE_DEFAULT_PROJECT_ID;
  if (defaultProjId) {
    const defaultProj = KNOWN_PLANE_PROJECTS.find((p) => p.id === defaultProjId);
    if (defaultProj) return defaultProj;
  }

  return KNOWN_PLANE_PROJECTS[0];
}

/**
 * Gán project mặc định cho một Slack Channel
 */
export async function setChannelDefaultProject(
  channelId: string,
  identifierOrName: string,
  env: Env
): Promise<PlaneProjectInfo | null> {
  const clean = identifierOrName.trim().toLowerCase();
  const proj = KNOWN_PLANE_PROJECTS.find(
    (p) =>
      p.id.toLowerCase() === clean ||
      p.identifier.toLowerCase() === clean ||
      p.name.toLowerCase().includes(clean)
  );
  if (!proj) return null;

  await env.KV.put(`channel_plane_project:${channelId}`, proj.id, {
    expirationTtl: 60 * 60 * 24 * 365, // 1 năm
  });
  return proj;
}

/**
 * Lấy thông tin project mặc định của Slack Channel
 */
export async function getChannelDefaultProject(
  channelId: string,
  env: Env
): Promise<PlaneProjectInfo | null> {
  try {
    const projId = await env.KV.get(`channel_plane_project:${channelId}`);
    if (projId) {
      return (
        KNOWN_PLANE_PROJECTS.find(
          (p) => p.id === projId || p.identifier.toLowerCase() === projId.toLowerCase()
        ) || null
      );
    }
  } catch {}
  return null;
}

/**
 * Format tin nhắn danh sách project dưới dạng Slack Block Kit
 */
export function formatProjectsListBlocks(currentChannelProject?: PlaneProjectInfo | null): any[] {
  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "📁 *Danh Sách Các Project Trên Hệ Thống Plane:*",
      },
    },
  ];

  if (currentChannelProject) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📌 *Project mặc định của kênh này:* *${currentChannelProject.name}* (\`${currentChannelProject.identifier}\`)`,
        },
      ],
    });
  }

  const projectFields = KNOWN_PLANE_PROJECTS.map((p) => ({
    type: "mrkdwn",
    text: `• *\`${p.identifier}\`* - ${p.name}\n  _${p.description || ""}_`,
  }));

  for (let i = 0; i < projectFields.length; i += 5) {
    const chunk = projectFields.slice(i, i + 5);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: chunk.map((c) => c.text).join("\n\n"),
      },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "💡 *Cách chọn Project khi tạo task/bug:*\n1. *Chỉ định trực tiếp khi chat:* `@bot tạo bug [CRM] lỗi...` hoặc `@bot tạo task dự án MVL: ...`\n2. *Gán mặc định cho kênh hiện tại:* `@bot set project <MÃ>` (Ví dụ: `@bot set project CRM` hoặc `@bot set project MVLGO`)\n3. *Nếu không chỉ định:* Bot mặc định tạo trên *MaiVietLand Phase 3* (`MVLCTV`).",
    },
  });

  return blocks;
}
