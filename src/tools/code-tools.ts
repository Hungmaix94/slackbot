import { GeminiFunctionDeclaration } from "../ai/gemini";
import { GitHubClient } from "../github/client";
import { ToolCall } from "../core/types";

export const CODE_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "search_codebase",
    description:
      "Tìm kiếm các file code hoặc biểu thức logic trong repository. QUAN TRỌNG: Mã nguồn dự án viết bằng tiếng Anh/Python/TypeScript. KHÔNG tìm bằng câu tiếng Việt. Bắt buộc dùng từ khóa kỹ thuật, tên model, hàm hoặc biến (ví dụ: 'SalesInvoice', 'sales_invoice', 'pdcdt', 'reconciliation', 'period', 'commission').",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo hoặc alias: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        query: {
          type: "STRING",
          description:
            "Từ khóa code tiếng Anh, tên class, hàm, model (ví dụ: 'SalesInvoice', 'sales_invoice', 'reconciliation', 'period').",
        },
      },
      required: ["repo", "query"],
    },
  },
  {
    name: "read_code_file",
    description:
      "Đọc nội dung của một file code cụ thể từ GitHub. Có thể chỉ định khoảng dòng bắt đầu và kết thúc.",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo hoặc alias: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        filePath: {
          type: "STRING",
          description: "Đường dẫn file (ví dụ: 'apps/advances/services.py' hoặc 'src/api/schema.ts').",
        },
        startLine: {
          type: "INTEGER",
          description: "Dòng bắt đầu cần đọc (1-indexed).",
        },
        endLine: {
          type: "INTEGER",
          description: "Dòng kết thúc cần đọc.",
        },
      },
      required: ["repo", "filePath"],
    },
  },
  {
    name: "list_repository_files",
    description:
      "Liệt kê danh sách các file trong thư mục của một repository trên GitHub.",
    parameters: {
      type: "OBJECT",
      properties: {
        repo: {
          type: "STRING",
          description: "Tên repo: 'backend', 'web', 'mobile', 'chat', 'app-sale'.",
        },
        prefix: {
          type: "STRING",
          description: "Tiền tố thư mục cần duyệt (ví dụ: 'apps/booking' hoặc 'src/pages').",
        },
      },
      required: ["repo"],
    },
  },
];

export async function executeCodeTool(
  github: GitHubClient,
  call: ToolCall
): Promise<string> {
  if (call.name === "search_codebase") {
    const repo = call.args.repo || "backend";
    const query = call.args.query;
    const searchRes = await github.searchCode(query, repo);
    return JSON.stringify(searchRes);
  }

  if (call.name === "read_code_file") {
    const repo = call.args.repo || "backend";
    const filePath = call.args.filePath;
    const fileRes = await github.readFile(repo, filePath, {
      startLine: call.args.startLine,
      endLine:
        call.args.endLine ||
        (call.args.startLine ? call.args.startLine + 100 : 120),
    });
    return fileRes.content;
  }

  if (call.name === "list_repository_files") {
    const repo = call.args.repo || "backend";
    const prefix = call.args.prefix || "";
    const listRes = await github.listFiles(repo, { prefix });
    return JSON.stringify(listRes);
  }

  return `Unknown function call: ${call.name}`;
}
