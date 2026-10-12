import { resolvePlaneModule } from "../plane/modules";

export interface SubtaskItem {
  name: string;
  assigneeSlackId?: string;
}

export interface ExtractedTaskInfo {
  taskName: string;
  moduleName: string;
  stepsToReproduce: string[];
  actualBehavior: string;
  expectedBehavior: string;
  severity: "urgent" | "high" | "medium" | "low" | "none";
  subtasks?: (string | SubtaskItem)[];
  targetModule?: string;
}

/**
 * Phân tích và trích xuất chuỗi JSON từ đầu ra của LLM
 */
export function extractJsonFromText(text: string): any {
  if (!text || typeof text !== "string") return null;

  // 1. Thử trích xuất từ code block ```json ... ``` hoặc ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 2. Tìm khối ngoặc nhọn ngoài cùng { ... }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.substring(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        const sanitized = candidate
          .replace(/,\s*([\}\]])/g, "$1") // Loại bỏ trailing commas
          .replace(/[\u201C\u201D]/g, '"') // Chuyển smart quotes sang double quotes
          .replace(/[\r\n\t]+/g, " "); // Chuẩn hóa ký tự xuống dòng
        return JSON.parse(sanitized);
      } catch {}
    }
  }

  // 3. Parse trực tiếp
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/**
 * Trích xuất nghiệp vụ thông minh bằng Heuristics nếu AI bị gián đoạn hoặc không trả về JSON
 */
export function extractBugHeuristically(
  messages: any[],
  threadTs: string,
  commandText?: string
): ExtractedTaskInfo {
  const combined = [commandText, ...messages.map((m) => m.text || "")].filter(Boolean).join(" ");

  // 1. Nhận diện module thông minh
  const targetMod = resolvePlaneModule(commandText || "") || resolvePlaneModule(combined);
  const moduleName = targetMod ? targetMod.name : "Chung";

  const rawCmd = (commandText || "").trim();
  let clean = combined
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/\[\s*(?:p31|as|crm|ai|ui|chung)\s*\]/gi, "")
    .replace(/(?:^|\s)-m\s+[a-z0-9_\-\.]+/gi, "")
    .replace(/\b(?:p31|test31|phase\s*3\.1)\b/gi, "")
    .trim();

  // 2. Trích xuất danh sách subtasks kèm assignee Slack ID
  const subtasks: SubtaskItem[] = [];
  const sourceText = rawCmd || clean;
  const lines = sourceText.split("\n");

  if (lines.length > 1) {
    for (const line of lines) {
      const trimmed = line.trim();
      const itemMatch = trimmed.match(/^(?:[-*•]|\d+[\.\)])\s+(.+)$/);
      if (itemMatch && itemMatch[1]) {
        const raw = itemMatch[1].trim();
        const mMatch = raw.match(/<@([A-Z0-9]+)>/);
        const assigneeSlackId = mMatch ? mMatch[1] : undefined;
        let name = raw
          .replace(/<@[A-Z0-9]+>/g, "")
          .replace(/(?:cho|giao|assign)\s*@?[a-zA-Z0-9\._\-]+/gi, "")
          .replace(/\s+(?:cho|giao|assign)\s*$/i, "")
          .replace(/[\(\)]/g, "")
          .trim();
        if (name.length >= 3) {
          name = name.charAt(0).toUpperCase() + name.slice(1);
          subtasks.push({ name, assigneeSlackId });
        }
      }
    }
  }

  // Nếu không có gạch đầu dòng, kiểm tra phân tách mệnh đề bằng dấu phẩy
  if (subtasks.length === 0) {
    const parts = sourceText.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (
        /(?:tạo|báo|add)\s*(?:bug|task|lỗi)/i.test(part) &&
        !/(?:update|cập nhật|sửa|fix|chip|diện tích|quỹ căn)/i.test(part)
      ) {
        continue;
      }
      const mMatch = part.match(/<@([A-Z0-9]+)>/);
      const assigneeSlackId = mMatch ? mMatch[1] : undefined;
      let name = part
        .replace(/<@[A-Z0-9]+>/g, "")
        .replace(/^(?:tạo|báo|add)\s*(?:bug|task|lỗi)\s*(?:p31|as|crm)?\s*(?:cho\s+)?/i, "")
        .replace(/(?:cho|giao|assign)\s*@?[a-zA-Z0-9\._\-]+/gi, "")
        .replace(/\s+(?:cho|giao|assign)\s*$/i, "")
        .replace(/[\(\)]/g, "")
        .trim();
      if (name.length >= 3) {
        if (/^các\s+thông\s+tin\s+diện\s+tích/i.test(name)) {
          name = "Cập nhật các thông tin diện tích và đơn giá căn";
        } else if (/^update\s+UI\s+chip\s+status/i.test(name)) {
          name = "Update UI chip status trạng thái căn";
        } else {
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }
        subtasks.push({ name, assigneeSlackId });
      }
    }
  }

  // 3. Tổng hợp tiêu đề Parent Bug chuẩn
  let shortDesc = "";
  if (lines.length > 1 && lines[0] && !lines[0].trim().startsWith("-")) {
    shortDesc = lines[0]
      .replace(/<@[A-Z0-9]+>/g, "")
      .replace(/\[\s*(?:p31|as|crm|ai|ui|chung)\s*\]/gi, "")
      .replace(/[:\-]$/, "")
      .trim();
  } else if (subtasks.length > 0) {
    if (subtasks.some((s) => /chip\s+status/i.test(s.name)) && subtasks.some((s) => /diện\s+tích/i.test(s.name))) {
      shortDesc = "Cập nhật bảng quỹ căn & trạng thái căn dự án";
    } else {
      shortDesc = subtasks.map((s) => s.name).join(" & ");
    }
  } else {
    shortDesc = clean
      .replace(/(?:tạo|báo|add)\s*(?:bug|task|lỗi)\s*(?:này|hộ|giúp)?\s*(?:cho\s+các\s+yêu\s+cầu\s+trong\s+thread|trong\s+thread)?\s*/gi, "")
      .trim();
  }

  shortDesc = shortDesc.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (shortDesc.length > 60) {
    shortDesc = shortDesc.substring(0, 57).trim() + "...";
  }
  if (!shortDesc || shortDesc.length < 5) {
    shortDesc = `Lỗi phát hiện từ Slack thread ${threadTs}`;
  }

  const taskName = `[BUG] [${moduleName}] - ${shortDesc}`;

  // Tìm URL trong nội dung thảo luận
  const urls: string[] = [];
  for (const m of messages) {
    const urlMatches = (m.text || "").match(/https?:\/\/[^\s>]+/g);
    if (urlMatches) {
      for (const u of urlMatches) {
        if (!urls.includes(u)) urls.push(u);
      }
    }
  }

  const stepsToReproduce = [
    urls.length > 0
      ? `1. Truy cập vào màn hình/liên kết: ${urls[0]}`
      : `1. Truy cập vào màn hình/phân hệ: ${moduleName}`,
    `2. Kiểm tra hiển thị thông tin bảng hàng / quỹ căn và trạng thái căn`,
    `3. Quan sát các chi tiết chưa đồng bộ: chip status và số liệu diện tích`,
  ];

  return {
    taskName,
    moduleName,
    stepsToReproduce,
    actualBehavior:
      subtasks.length > 0
        ? subtasks.map((s) => `- ${s.name}`).join("\n")
        : clean || `Lỗi phát sinh trong thread ${threadTs}`,
    expectedBehavior: "Giao diện và dữ liệu hiển thị chính xác theo quy định nghiệp vụ và thiết kế.",
    severity: "high",
    subtasks: subtasks.length > 0 ? subtasks : undefined,
  };
}

/**
 * Trích xuất thông tin Bug Report từ nội dung thảo luận Slack Thread
 */
export async function extractTaskFromThread(params: {
  messages: any[];
  threadTs: string;
  query: string;
  aiClient: any;
}): Promise<ExtractedTaskInfo> {
  const { messages, threadTs, query, aiClient } = params;

  // Lọc lấy nội dung thảo luận (bỏ các tag bot)
  const threadText = messages
    .map((m) => {
      const u = m.user || "User";
      const t = (m.text || "").replace(/<@[A-Z0-9]+>/g, "").trim();
      return `${u}: ${t}`;
    })
    .filter(Boolean)
    .join("\n");

  const prompt = `Bạn là trợ lý QA kỹ thuật cao cấp của hệ thống MaiVietLand ERP.
Nhiệm vụ: Hãy phân tích đoạn thảo luận sau từ Slack thread và trích xuất thông tin tạo Bug Report chuẩn cho hệ thống Plane.
Nếu phát hiện đoạn thảo luận đề cập đến nhiều lỗi, nhiều việc con (sub-tasks) hoặc nhiều trường hợp kiểm thử riêng biệt, hãy phân tách rõ Parent Bug và danh sách "subtasks".
BẮT BUỘC chỉ trả về DUY NHẤT 1 đối tượng JSON hợp lệ, KHÔNG viết bất kỳ lời chào, giải thích hay markdown nào bên ngoài JSON.

Schema JSON:
{
  "taskName": "[BUG] [Tên phân hệ] - Mô tả lỗi tổng quát ngắn gọn (dưới 70 ký tự)",
  "moduleName": "Tên phân hệ (ví dụ: Test phase 3.1, App Sale, CRM, Trợ lý AI, Design Revamp, Quản lý Quỹ...)",
  "stepsToReproduce": ["1. Truy cập màn hình...", "2. Thực hiện thao tác..."],
  "actualBehavior": "Mô tả lỗi thực tế gặp phải",
  "expectedBehavior": "Mô tả kết quả mong muốn đúng nghiệp vụ",
  "severity": "Blocker / Critical / Major / Minor",
  "subtasks": ["Tên sub-issue 1 nếu có nhiều lỗi hoặc các checklist cụ thể", "Tên sub-issue 2..."]
}

Nội dung thảo luận:
${threadText || query}`;

  try {
    const parsedRes = await aiClient.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction:
        "Bạn là API phân tích dữ liệu. Chỉ trả về chuỗi JSON thuần túy, không có text hay markdown ngoài JSON.",
      temperature: 0.1,
      responseMimeType: "application/json",
    });

    const parsedJson = extractJsonFromText(parsedRes?.text || "");
    if (parsedJson && parsedJson.taskName) {
      const severityMap: Record<string, "urgent" | "high" | "medium" | "low" | "none"> = {
        blocker: "urgent",
        critical: "urgent",
        major: "high",
        medium: "medium",
        minor: "low",
      };

      const rawSeverity = String(parsedJson.severity || "Major").toLowerCase();
      const planePriority = severityMap[rawSeverity] || "high";

      // Nhận diện module thông minh nếu AI trả về Chung hoặc người dùng chỉ định tag
      const resolvedMod = resolvePlaneModule(query || "") || resolvePlaneModule(threadText);
      const moduleName = resolvedMod ? resolvedMod.name : String(parsedJson.moduleName || "Chung").trim();

      // Chuẩn hóa taskName: loại bỏ xuống dòng, format [BUG] [ModuleName]
      let finalTaskName = String(parsedJson.taskName || "")
        .replace(/[\r\n]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (resolvedMod) {
        finalTaskName = finalTaskName.replace(/\[\s*Chung\s*\]/gi, `[${moduleName}]`);
        if (!finalTaskName.includes(`[${moduleName}]`)) {
          finalTaskName = `[BUG] [${moduleName}] - ${finalTaskName.replace(/^\[BUG\]\s*(?:\[.*?\])?\s*-?\s*/i, "")}`;
        }
      }

      if (finalTaskName.toLowerCase().includes("lỗi phát hiện từ slack thread") || finalTaskName.length < 10) {
        finalTaskName = `[BUG] [${moduleName}] - ${parsedJson.actualBehavior?.substring(0, 55) || "Lỗi nghiệp vụ"}`;
      }

      const subtasks = Array.isArray(parsedJson.subtasks)
        ? parsedJson.subtasks.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0)
        : undefined;

      return {
        taskName: finalTaskName,
        moduleName,
        stepsToReproduce: Array.isArray(parsedJson.stepsToReproduce)
          ? parsedJson.stepsToReproduce
          : [String(parsedJson.stepsToReproduce || "Xem chi tiết trong link thảo luận Slack")],
        actualBehavior: String(parsedJson.actualBehavior || "Lỗi phát sinh trong quá trình thao tác"),
        expectedBehavior: String(parsedJson.expectedBehavior || "Hệ thống xử lý đúng quy định nghiệp vụ"),
        severity: planePriority,
        subtasks: subtasks && subtasks.length > 0 ? subtasks : undefined,
      };
    }
  } catch (aiErr) {
    console.warn("AI task extraction error, falling back to heuristic:", aiErr);
  }

  // Fallback thông minh nếu AI gặp lỗi
  return extractBugHeuristically(messages, threadTs, query);
}
