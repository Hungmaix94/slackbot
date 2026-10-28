export interface ExtractedTaskInfo {
  taskType: "bug" | "task";
  taskName: string;
  moduleName: string;
  stepsToReproduce: string[];
  actualBehavior: string;
  expectedBehavior: string;
  severity: "urgent" | "high" | "medium" | "low" | "none";
  explicitAssignee?: string;
}

/**
 * Phân tích và trích xuất chuỗi JSON từ đầu ra của LLM
 */
export function extractJsonFromText(text: string): any {
  if (!text || typeof text !== "string") return null;

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.substring(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        const sanitized = candidate
          .replace(/,\s*([\}\]])/g, "$1")
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\r\n\t]+/g, " ");
        return JSON.parse(sanitized);
      } catch {}
    }
  }

  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Nhận diện phân hệ nghiệp vụ từ nội dung tin nhắn
 */
export function inferModuleName(text: string): string {
  const q = text.toLowerCase();
  const domainMap: Array<[string[], string]> = [
    [["đối chiếu", "pdcdt", "chủ đầu tư", "cđt"], "Đối chiếu CĐT"],
    [["hóa đơn bán ra", "xuất hóa đơn", "sales invoice"], "Hóa đơn bán ra"],
    [["sàn liên kết", "slk", "linked exchange"], "Hoa hồng Sàn liên kết"],
    [["tạm ứng", "hoàn ứng", "khấu trừ tạm ứng"], "Tạm ứng & Hoàn ứng"],
    [["tạm giữ", "giải tỏa"], "Tạm giữ Hoa hồng"],
    [["đợt chi", "lệnh chi", "thanh toán hoa hồng"], "Đợt chi Hoa hồng"],
    [["bảng tổng hợp", "hoa hồng tháng", "chia hh", "hoa hồng"], "Hoa hồng"],
    [["kỳ kế toán", "đóng kỳ", "mở kỳ"], "Kỳ kế toán"],
    [["giữ chỗ", "lock căn", "booking"], "Giữ chỗ"],
    [["đặt cọc", "chuyển cọc", "hợp đồng đặt cọc"], "Đặt cọc"],
    [["bảng hàng", "chỉ căn", "phân khu", "tòa nhà"], "Bảng hàng"],
    [["crm", "khách hàng", "lead"], "CRM"],
    [["ctv", "cộng tác viên"], "Cộng tác viên"],
    [["thông báo", "notification", "fcm"], "Thông báo"],
    [["nhân sự", "hrm", "chấm công"], "Nhân sự"],
  ];

  for (const [keywords, label] of domainMap) {
    if (keywords.some((kw) => q.includes(kw))) {
      return label;
    }
  }

  // Kiểm tra tiền tố dạng [Phân hệ] (bỏ qua các mã project Plane như [CRM], [MVLCTV]...)
  const bracketMatches = text.matchAll(/\[([^\]]{2,30})\]/g);
  const projectCodes = new Set(["mvlctv", "mvl", "mvlgo", "maivietlan", "crm", "devops", "dstax", "feteams", "glintecowebs", "bug", "task", "feature"]);
  for (const m of bracketMatches) {
    const val = m[1].trim();
    if (!projectCodes.has(val.toLowerCase())) {
      return val;
    }
  }

  return "Hệ thống";
}

/**
 * Trích xuất người được giao việc (assignee) từ câu lệnh tạo task nhanh
 */
export function extractExplicitAssignee(text: string): string | undefined {
  if (!text) return undefined;

  // 1. Ưu tiên tuyệt đối tìm @username (ví dụ: @ducpm, @phuongkt)
  const atMatches = Array.from(text.matchAll(/(?:^|\s)@([a-zA-Z0-9._\-]{2,30})\b/g));
  for (const m of atMatches) {
    const candidate = m[1].trim();
    if (!["bot", "srs", "channel", "here", "everyone"].includes(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // 2. Nếu không có dấu @, tìm cụm "giao cho <username>" hoặc "assign to <username>" ở cuối câu
  const assignMatch = text.match(
    /(?:giao\s+cho|assign\s+to|assign\s+cho)\s+([a-zA-Z0-9._\-]{3,30})\s*$/i
  );
  if (assignMatch && assignMatch[1]) {
    return assignMatch[1].trim();
  }

  return undefined;
}

/**
 * Trích xuất nhanh Task / Bug bằng Heuristics (hỗ trợ cả tạo nhanh 1 tin nhắn và tạo từ thread)
 */
export function extractBugHeuristically(
  messages: any[],
  threadTs: string,
  commandText?: string
): ExtractedTaskInfo {
  const userMsgs = (messages || [])
    .filter((m) => !m.bot_id && m.subtype !== "bot_message")
    .map((m) => m.text || "");
  const combined = [commandText, ...userMsgs].filter(Boolean).join(" ").trim();
  const clean = combined.replace(/<@[A-Z0-9]+>/g, "").trim();

  const lower = clean.toLowerCase();
  const isBug =
    lower.includes("bug") ||
    lower.includes("lỗi") ||
    lower.includes("không được") ||
    lower.includes("bị sai") ||
    lower.includes("bị chặn") ||
    lower.includes("exception") ||
    lower.includes("500") ||
    lower.includes("400");

  const taskType: "bug" | "task" = isBug ? "bug" : "task";
  const moduleName = inferModuleName(clean);
  const explicitAssignee = extractExplicitAssignee(clean);

  // Làm sạch phần mô tả khỏi từ khóa ra lệnh và mã project/assignee
  let description = clean
    .replace(/^\/?(?:create[-_]task|plane[-_]task|clickup[-_]task|task|bug)\s*/i, "")
    .replace(/^(?:tạo|tao|báo|bao|log|lên|len)\s+(?:nhanh\s+)?(?:task|bug|lỗi|loi|việc|issue)(?:\s+trên\s+plane|\s+plane|\s+clickup|\s+này|\s+hộ|\s+giúp)?\s*[:\-]?\s*/i, "")
    .replace(/\[(?:MVLCTV|MVL|MVLGO|MAIVIETLAN|CRM|DEVOPS|DSTAX|FETEAMS|GLINTECOWEBS)\]\s*[:\-]?\s*/gi, "")
    .replace(/(?:dự\s*án|project)\s*[:=]?\s*(?:MVLCTV|MVL|MVLGO|MAIVIETLAN|CRM|DEVOPS|DSTAX|FETEAMS|GLINTECOWEBS)\s*[:\-]?\s*/gi, "")
    .replace(/(?:giao\s+cho|giao|assign\s+to|assign)\s+@?[a-zA-Z0-9._\-]+\s*$/i, "")
    .replace(/\s+@[a-zA-Z0-9._\-]+\s*$/i, "")
    .trim();

  if (!description || description.length < 3) {
    description = clean || `Yêu cầu từ Slack ${threadTs || "trực tiếp"}`;
  }

  const shortDesc =
    description.length > 65 ? description.substring(0, 62).trim() + "..." : description;
  const prefix = taskType === "bug" ? "[BUG]" : "[TASK]";
  const taskName = `${prefix} [${moduleName}] - ${shortDesc}`;

  let severity: "urgent" | "high" | "medium" | "low" = isBug ? "high" : "medium";
  if (lower.includes("urgent") || lower.includes("khẩn") || lower.includes("gấp") || lower.includes("blocker") || lower.includes("500")) {
    severity = "urgent";
  } else if (lower.includes("low") || lower.includes("nhỏ") || lower.includes("minor")) {
    severity = "low";
  }

  return {
    taskType,
    taskName,
    moduleName,
    stepsToReproduce: [
      `Truy cập phân hệ ${moduleName}`,
      `Thực hiện: ${shortDesc}`,
    ],
    actualBehavior: description,
    expectedBehavior:
      taskType === "bug"
        ? "Hệ thống xử lý chính xác theo đúng quy định nghiệp vụ."
        : "Hoàn thành tính năng/công việc đúng yêu cầu nghiệp vụ.",
    severity,
    explicitAssignee,
  };
}

/**
 * Trích xuất thông tin Task / Bug từ tin nhắn đơn lẻ hoặc Slack Thread
 */
export async function extractTaskFromThread(params: {
  messages: any[];
  threadTs: string;
  query: string;
  aiClient?: any;
}): Promise<ExtractedTaskInfo> {
  const { messages, threadTs, query, aiClient } = params;
  const fallback = extractBugHeuristically(messages, threadTs, query);

  if (!aiClient) {
    return fallback;
  }

  const threadText = (messages || [])
    .filter((m) => !m.bot_id && m.subtype !== "bot_message")
    .map((m) => {
      const u = m.user || "User";
      const t = (m.text || "").replace(/<@[A-Z0-9]+>/g, "").trim();
      return `${u}: ${t}`;
    })
    .filter(Boolean)
    .join("\n");

  const inputContext = [query, threadText].filter(Boolean).join("\n").trim();
  if (!inputContext) {
    return fallback;
  }

  const prompt = `Trích xuất thông tin tạo Task/Bug ngắn gọn trên Plane từ yêu cầu Slack sau.
BẮT BUỘC chỉ trả về DUY NHẤT 1 JSON hợp lệ (không markdown, không giải thích):
{
  "taskType": "bug" hoặc "task",
  "taskName": "[BUG/TASK] [Tên phân hệ] - Tiêu đề ngắn gọn dưới 65 ký tự",
  "moduleName": "Tên phân hệ ngắn gọn",
  "stepsToReproduce": ["Bước 1...", "Bước 2..."],
  "actualBehavior": "Mô tả lỗi hoặc yêu cầu ngắn gọn",
  "expectedBehavior": "Kết quả mong muốn ngắn gọn",
  "severity": "urgent | high | medium | low",
  "explicitAssignee": "username hoặc tên người được giao nếu có"
}

Nội dung:
${inputContext}`;

  try {
    const parsedRes = await aiClient.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: "Chỉ trả về chuỗi JSON thuần túy.",
      temperature: 0.1,
    });

    const parsedJson = extractJsonFromText(parsedRes?.text || "");
    if (parsedJson && parsedJson.taskName) {
      const rawType = String(parsedJson.taskType || fallback.taskType).toLowerCase();
      const taskType: "bug" | "task" = rawType === "task" || rawType === "feature" ? "task" : "bug";
      const moduleName = String(parsedJson.moduleName || fallback.moduleName).trim();

      let finalTaskName = String(parsedJson.taskName).trim();
      if (finalTaskName.length < 8) {
        finalTaskName = fallback.taskName;
      }

      const rawSev = String(parsedJson.severity || fallback.severity).toLowerCase();
      const sevMap: Record<string, "urgent" | "high" | "medium" | "low"> = {
        blocker: "urgent",
        critical: "urgent",
        urgent: "urgent",
        major: "high",
        high: "high",
        medium: "medium",
        minor: "low",
        low: "low",
      };

      return {
        taskType,
        taskName: finalTaskName,
        moduleName,
        stepsToReproduce: Array.isArray(parsedJson.stepsToReproduce)
          ? parsedJson.stepsToReproduce
          : fallback.stepsToReproduce,
        actualBehavior: String(parsedJson.actualBehavior || fallback.actualBehavior),
        expectedBehavior: String(parsedJson.expectedBehavior || fallback.expectedBehavior),
        severity: sevMap[rawSev] || fallback.severity,
        explicitAssignee: parsedJson.explicitAssignee || fallback.explicitAssignee,
      };
    }
  } catch (aiErr) {
    console.warn("AI task extraction fallback to heuristic:", aiErr);
  }

  return fallback;
}
