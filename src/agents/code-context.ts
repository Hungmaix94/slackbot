import { GitHubClient } from "../github/client";

export interface PreloadedCodeSnippet {
  repo: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  description: string;
}

/**
 * Danh sách cấu hình pre-fetch theo các chủ đề nghiệp vụ/kỹ thuật phổ biến
 */
const DOMAIN_CODE_MAP: Array<{
  keywords: string[];
  snippets: PreloadedCodeSnippet[];
}> = [
  {
    // Luồng: Đối chiếu CĐT -> Hóa đơn bán ra / Kỳ hoa hồng
    keywords: [
      "đối chiếu", "doi chieu", "cđt", "cdt", "hóa đơn", "hoa don",
      "bán ra", "ban ra", "kỳ hoa hồng", "ky hoa hong", "kỳ kế toán",
      "ky ke toan", "pdcdt", "irs", "sales_invoice"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/sales_invoice_service.py",
        startLine: 20,
        endLine: 45,
        description: "Logic định danh kỳ kế toán (_resolve_period) và bên xuất hóa đơn",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/sales_invoice_service.py",
        startLine: 219,
        endLine: 277,
        description: "Hàm create_from_pdcdt (Khởi tạo Hóa đơn bán ra từ Phiếu đối chiếu CĐT)",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/signals.py",
        startLine: 350,
        endLine: 376,
        description: "Signal tự động sinh SalesInvoice khi InvestorReconciliationSheet chuyển sang CONFIRMED",
      },
      {
        repo: "backend",
        filePath: "apps/sales/models/investor_reconciliation_sheet.py",
        startLine: 63,
        endLine: 80,
        description: "Model InvestorReconciliationSheet (chứa trường reconciliation_date, status)",
      },
    ],
  },
];

/**
 * Tự động trích xuất các đoạn mã nguồn cốt lõi dựa trên câu query của người dùng
 */
export async function getSmartCodeContext(
  query: string,
  github?: GitHubClient
): Promise<string> {
  if (!github) {
    return "";
  }

  const q = query.toLowerCase();
  const matchedSnippets: PreloadedCodeSnippet[] = [];

  for (const domain of DOMAIN_CODE_MAP) {
    let matchCount = 0;
    for (const kw of domain.keywords) {
      if (q.includes(kw)) {
        matchCount++;
      }
    }
    // Nếu trùng khớp ít nhất 2 từ khóa đặc trưng trong miền nghiệp vụ
    if (matchCount >= 2) {
      matchedSnippets.push(...domain.snippets);
    }
  }

  if (matchedSnippets.length === 0) {
    return "";
  }

  let codeContext = "\n\n=== MÃ NGUỒN LIÊN QUAN TRỰC TIẾP TỪ REPO HỆ THỐNG (MVL-ERP) ===\n";

  for (const snip of matchedSnippets) {
    try {
      const fileRes = await github.readFile(snip.repo, snip.filePath, {
        startLine: snip.startLine,
        endLine: snip.endLine,
      });

      codeContext += `\n[File: ${snip.repo}/${snip.filePath} (Dòng ${snip.startLine || 1} - ${snip.endLine || fileRes.totalLines})] - ${snip.description}:\n`;
      codeContext += "```python\n";
      codeContext += fileRes.content;
      codeContext += "\n```\n";
    } catch (e: any) {
      console.warn(`Lỗi khi pre-fetch snippet ${snip.filePath}:`, e.message || e);
    }
  }

  return codeContext;
}
