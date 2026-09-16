export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

/**
 * Chuyển đổi Markdown tiêu chuẩn sang Slack mrkdwn
 */
export function markdownToSlackLinks(text: string): string {
  if (!text) return "";

  // 1. Chuyển [Text](URL) thành <URL|Text>
  let converted = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // 2. Chuyển [86eyXXXXX] hoặc 86eyXXXXX thành link ClickUp
  converted = converted.replace(
    /(?<!\|)(?<!\/)(?<!\w)\[(86[a-zA-Z0-9]{5,10})\]/g,
    "<https://app.clickup.com/t/$1|[$1]>"
  );

  // 3. Chuyển đổi **bold** sang *bold* của Slack mrkdwn (trừ khi nằm trong link)
  converted = converted.replace(/(?<!\*)\*\*([^*]+)\*\*(?!\*)/g, "*$1*");

  return converted;
}

/**
 * Phân tích cú pháp các bảng Markdown trong văn bản do AI sinh ra
 */
export function parseAllMarkdownTables(text: string): MarkdownTable[] {
  if (!text) return [];

  const lines = text.split("\n");
  const tables: MarkdownTable[] = [];
  let currentTable: MarkdownTable | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const parts = trimmed
        .split("|")
        .slice(1, -1)
        .map((p) => p.trim());

      // Bỏ qua dòng separator ví dụ: |:---|:---|
      if (parts.length > 0 && parts.every((p) => /^:?-+:?$/.test(p))) {
        continue;
      }

      if (!parts.some((p) => p.length > 0)) {
        continue;
      }

      if (!currentTable) {
        currentTable = { headers: parts, rows: [] };
      } else {
        currentTable.rows.push(parts);
      }
    } else {
      if (currentTable) {
        if (currentTable.rows.length > 0) {
          tables.push(currentTable);
        }
        currentTable = null;
      }
    }
  }

  if (currentTable && currentTable.rows.length > 0) {
    tables.push(currentTable);
  }

  return tables;
}

/**
 * Trích xuất từ khóa tìm kiếm ClickUp cơ bản từ câu hỏi
 */
export function extractClickupSearchTerm(query: string): string {
  if (!query) return "";

  // 1. Kiểm tra xem có mã task ClickUp không (vd: 86eyXXXXX hoặc 86XXXXX)
  const taskMatch = query.match(/\b(86[a-zA-Z0-9]{5,10})\b/);
  if (taskMatch) {
    return taskMatch[1];
  }

  // 2. Bỏ qua các từ hỏi và tag bot
  let cleaned = query
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/^[/]?(bugs?|tasks?|clickup)\s*/i, "")
    .replace(/(tìm|kiểm tra|xem|check|tra cứu|danh sách|task|bug|lỗi|trên clickup)\s+/gi, "")
    .trim();

  return cleaned;
}
