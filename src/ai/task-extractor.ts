export interface ExtractedTaskInfo {
  taskName: string;
  moduleName: string;
  stepsToReproduce: string[];
  actualBehavior: string;
  expectedBehavior: string;
  severity: "urgent" | "high" | "medium" | "low" | "none";
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
  // Bỏ các tag mention <@U...>
  const clean = combined.replace(/<@[A-Z0-9]+>/g, "").trim();

  // Tìm tên màn hình / phân hệ
  let moduleName = "Chung";
  let targetClean = clean.replace(/^(?:ở|tại)\s+/i, "");
  const modPrefixMatch = targetClean.match(/^(?:màn\s+hình|màn|phân\s+hệ|trang)\s+([A-Za-z0-9À-ỹ\s]+?)(?:,|\.|-|\n|Nhập|Lỗi|lỗi|$)/i);
  if (modPrefixMatch && modPrefixMatch[1]?.trim()) {
    moduleName = modPrefixMatch[1].trim();
  } else {
    const modMatch = targetClean.match(
      /(?:ở|tại|màn\s+hình|màn|phân\s+hệ|trang)\s+([A-Za-z0-9À-ỹ\s]+?)(?:,|\.|-|\n|Nhập|Lỗi|lỗi|$)/i
    );
    if (modMatch && modMatch[1]?.trim()) {
      const rawMod = modMatch[1].trim();
      if (rawMod.length >= 2 && rawMod.length <= 40) {
        moduleName = rawMod;
      }
    }
  }

  // Lọc bỏ từ khóa kích hoạt lệnh tạo task
  let description = clean
    .replace(/(?:tạo|báo|add)\s*(?:bug|task|lỗi)\s*(?:này|hộ|giúp)?\s*/gi, "")
    .replace(/^(?:ở|tại)\s+(?:màn\s+hình|màn|phân\s+hệ|trang)?\s*/i, "")
    .trim();

  if (!description || description.length < 5) {
    description = clean || `Lỗi phát hiện từ Slack thread ${threadTs}`;
  }

  const shortDesc =
    description.length > 60 ? description.substring(0, 57).trim() + "..." : description;
  const taskName = `[BUG] [${moduleName}] - ${shortDesc}`;

  return {
    taskName,
    moduleName,
    stepsToReproduce: [
      `1. Truy cập vào màn hình/phân hệ: ${moduleName}`,
      `2. Thực hiện thao tác: ${shortDesc}`,
      `3. Quan sát kết quả xử lý của hệ thống`,
    ],
    actualBehavior: description,
    expectedBehavior: "Hệ thống xử lý và lưu trữ dữ liệu chính xác, đúng nghiệp vụ quy định.",
    severity: "high",
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
BẮT BUỘC chỉ trả về DUY NHẤT 1 đối tượng JSON hợp lệ, KHÔNG viết bất kỳ lời chào, giải thích hay markdown nào bên ngoài JSON.

Schema JSON:
{
  "taskName": "[BUG] [Tên phân hệ] - Mô tả lỗi ngắn gọn (dưới 70 ký tự)",
  "moduleName": "Tên phân hệ (ví dụ: Chia HH thực nhận, Quản lý Quỹ, Tạm ứng, Đặt cọc, CRM...)",
  "stepsToReproduce": ["1. Truy cập màn hình...", "2. Thực hiện thao tác..."],
  "actualBehavior": "Mô tả lỗi thực tế gặp phải",
  "expectedBehavior": "Mô tả kết quả mong muốn đúng nghiệp vụ",
  "severity": "Blocker / Critical / Major / Minor"
}

Nội dung thảo luận:
${threadText || query}`;

  try {
    const parsedRes = await aiClient.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction:
        "Bạn là API phân tích dữ liệu. Chỉ trả về chuỗi JSON thuần túy, không có text hay markdown ngoài JSON.",
      temperature: 0.1,
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

      // Kiểm tra xem taskName có bị generic không
      let finalTaskName = String(parsedJson.taskName).trim();
      const moduleName = String(parsedJson.moduleName || "Chung").trim();

      if (finalTaskName.toLowerCase().includes("lỗi phát hiện từ slack thread") || finalTaskName.length < 10) {
        finalTaskName = `[BUG] [${moduleName}] - ${parsedJson.actualBehavior?.substring(0, 55) || "Lỗi nghiệp vụ"}`;
      }

      return {
        taskName: finalTaskName,
        moduleName,
        stepsToReproduce: Array.isArray(parsedJson.stepsToReproduce)
          ? parsedJson.stepsToReproduce
          : [String(parsedJson.stepsToReproduce || "Xem chi tiết trong link thảo luận Slack")],
        actualBehavior: String(parsedJson.actualBehavior || "Lỗi phát sinh trong quá trình thao tác"),
        expectedBehavior: String(parsedJson.expectedBehavior || "Hệ thống xử lý đúng quy định nghiệp vụ"),
        severity: planePriority,
      };
    }
  } catch (aiErr) {
    console.warn("AI task extraction error, falling back to heuristic:", aiErr);
  }

  // Fallback thông minh nếu AI gặp lỗi
  return extractBugHeuristically(messages, threadTs, query);
}
