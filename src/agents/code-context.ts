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
    // Luồng: Đối chiếu CĐT -> Hóa đơn bán ra / Doanh thu / Kỳ hoa hồng
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
  {
    // Luồng: Ghi sổ Hoa hồng theo tháng Sàn liên kết -> Bảng tổng hợp hoa hồng nhân viên
    keywords: [
      "sàn liên kết", "san lien ket", "hoa hồng theo tháng", "hoa hong theo thang",
      "ghi sổ", "ghi so", "bảng tổng hợp", "bang tong hop", "bảng kê", "bang ke",
      "linked-exchange", "linked_exchange", "monthly summary", "employee summary",
      "draft", "nháp", "beneficiary", "beneficiary_employee", "post_accounting"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/linked_exchange_dept_commission_service.py",
        startLine: 742,
        endLine: 760,
        description: "Hàm _attach_summary_line: Ràng buộc trạng thái DRAFT của MonthlyBeneficiaryCommissionSummary trước khi đính kèm dòng hoa hồng sàn liên kết",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/linked_exchange_dept_commission_service.py",
        startLine: 920,
        endLine: 953,
        description: "Hàm post_accounting: Cơ chế Ghi sổ Hoa hồng theo tháng Sàn liên kết và gọi _attach_summary_line",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/monthly_summary_service.py",
        startLine: 1405,
        endLine: 1445,
        description: "Hàm reopen: Mở lại bảng tổng hợp hoa hồng người thụ hưởng từ CONFIRMED về DRAFT để cập nhật/tính toán lại",
      },
    ],
  },
  {
    // Luồng: Tạm ứng & Thu hồi hoàn ứng hoa hồng
    keywords: [
      "tạm ứng", "tam ung", "thu hồi", "thu hoi", "hoàn ứng", "hoan ung",
      "commission advance", "advance repayment", "advance_recovery"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_advance_service.py",
        startLine: 1,
        endLine: 65,
        description: "Dịch vụ Tạm ứng hoa hồng nhân viên",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_advance_repayment_service.py",
        startLine: 240,
        endLine: 275,
        description: "Hàm khấu trừ và hoàn ứng hoa hồng từ Bảng tổng hợp theo tháng",
      },
    ],
  },
  {
    // Luồng: Tạm giữ hoa hồng
    keywords: [
      "tạm giữ", "tam giu", "giữ hoa hồng", "giu hoa hong", "commission hold"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_hold_service.py",
        startLine: 825,
        endLine: 865,
        description: "Logic tạm giữ hoa hồng trên bảng tổng hợp nhân viên",
      },
    ],
  },
  {
    // Luồng: Đợt chi & Lệnh chi hoa hồng
    keywords: [
      "đợt chi", "dot chi", "payout wave", "payout batch", "lệnh chi", "lenh chi", "chi trả hoa hồng"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/payout_wave_service.py",
        startLine: 110,
        endLine: 160,
        description: "Dịch vụ quản lý các đợt chi (payout wave)",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_payout_batch_service.py",
        startLine: 125,
        endLine: 170,
        description: "Tạo và kiểm tra đợt thanh toán (payout batch)",
      },
    ],
  },
  {
    // Luồng: Kỳ kế toán & Đóng / Mở kỳ
    keywords: [
      "kỳ kế toán", "ky ke toan", "đóng kỳ", "dong ky", "mở kỳ", "mo ky", "soft close", "hard close"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/accounting_period_service.py",
        startLine: 135,
        endLine: 180,
        description: "Dịch vụ vòng đời kỳ kế toán: Đóng mềm, đóng cứng và mở lại kỳ (reopen)",
      },
    ],
  },
  {
    // Luồng: Thông báo / Celery Tasks / FCM
    keywords: [
      "thông báo", "thong bao", "notification", "notifications", "fcm", "firebase",
      "celery", "task", "tasks", "tasks.py", "bắn thông báo", "gửi thông báo",
      "push notification", "device token"
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/notifications/tasks.py",
        startLine: 1,
        endLine: 120,
        description: "Celery tasks xử lý gửi thông báo đẩy (FCM) và thông báo hệ thống",
      },
      {
        repo: "backend",
        filePath: "apps/notifications/fcm_service.py",
        startLine: 1,
        endLine: 100,
        description: "Dịch vụ FCMService gửi thông báo qua Firebase Cloud Messaging",
      },
    ],
  },
];

/**
 * Trích xuất các cụm thông báo lỗi cụ thể từ câu truy vấn hoặc payload JSON
 */
function extractErrorPhrases(query: string): string[] {
  const phrases: string[] = [];

  // Match detail trong JSON: "detail": "..." hoặc 'detail': '...'
  const detailMatch = query.match(/['"]detail['"]\s*:\s*['"]([^'"]+)['"]/i);
  if (detailMatch && detailMatch[1]) {
    phrases.push(detailMatch[1].trim());
  }

  // Match message trong JSON
  const msgMatch = query.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/i);
  if (msgMatch && msgMatch[1]) {
    phrases.push(msgMatch[1].trim());
  }

  // Match các chuỗi dài trong ngoặc kép chứa thông báo lỗi tiếng Anh
  const quotes = query.matchAll(/['"]([^'"]{12,})['"]/g);
  for (const q of quotes) {
    const val = q[1].trim();
    if (!phrases.includes(val) && !val.startsWith("http")) {
      phrases.push(val);
    }
  }

  return phrases;
}

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

  // 0. Trích xuất file path cụ thể được chỉ định rõ trong query (ví dụ: apps/notifications/tasks.py, tasks.py)
  const filePathRegex = /(?:apps|src|services|models|workflows|views|api)[\w\/\.\-]+\.(?:py|ts|tsx|js|json)/gi;
  const pathMatches = query.match(filePathRegex) || [];
  for (const p of pathMatches) {
    const cleanPath = p.replace(/^backend\//, "").replace(/^\/+/, "");
    if (!matchedSnippets.some((s) => s.filePath === cleanPath)) {
      matchedSnippets.push({
        repo: "backend",
        filePath: cleanPath,
        startLine: 1,
        endLine: 120,
        description: `Mã nguồn file ${cleanPath} được nhắc tới trực tiếp trong câu hỏi`,
      });
    }
  }

  // Nhận diện theo tên file phổ biến kết hợp từ khóa
  if (matchedSnippets.length === 0) {
    const fileMatch = query.match(/\b([a-zA-Z0-9_\-]+\.(?:py|ts|tsx))\b/i);
    if (fileMatch && fileMatch[1]) {
      const fname = fileMatch[1].toLowerCase();
      if (fname === "tasks.py") {
        if (q.includes("notif") || q.includes("thông báo") || q.includes("thong bao") || q.includes("fcm")) {
          matchedSnippets.push({
            repo: "backend",
            filePath: "apps/notifications/tasks.py",
            startLine: 1,
            endLine: 120,
            description: "File apps/notifications/tasks.py xử lý thông báo",
          });
        }
      }
    }
  }

  // 1. So khớp các chủ đề nghiệp vụ định sẵn
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

  let dynamicCodeSnippets = "";

  // 2. Tra cứu động theo thông báo lỗi cụ thể nếu có
  const errorPhrases = extractErrorPhrases(query);
  for (const phrase of errorPhrases) {
    // Rút gọn các từ khóa kỹ thuật cốt lõi (bỏ dấu chấm câu)
    const cleanPhrase = phrase.replace(/[^\w\s\.\_\-]/g, " ").trim();
    if (cleanPhrase.length < 5) continue;

    try {
      // Tìm kiếm trong backend repo
      const searchResults = await github.searchCode("backend", cleanPhrase);
      const codeFiles = searchResults.filter((f) => /\.(py|ts|tsx)$/i.test(f.path));
      if (codeFiles.length > 0) {
        const targetFile = codeFiles[0];
        // Đọc nội dung xung quanh dòng lỗi bằng cách truyền searchKeyword
        const keywordToFind = cleanPhrase.split(" ").slice(0, 4).join(" ");
        const fileContent = await github.readFile("backend", targetFile.path, {
          searchKeyword: keywordToFind,
        });

        dynamicCodeSnippets += `\n[File: backend/${targetFile.path} (Dòng ${fileContent.startLine || 1} - ${fileContent.endLine || fileContent.totalLines})] - Nơi định nghĩa/ném thông báo lỗi "${phrase}":\n`;
        dynamicCodeSnippets += "```python\n";
        dynamicCodeSnippets += fileContent.content;
        dynamicCodeSnippets += "\n```\n";
      }
    } catch (searchErr) {
      console.warn(`Lỗi khi tìm mã nguồn động cho lỗi "${phrase}":`, searchErr);
    }
  }

  if (matchedSnippets.length === 0 && !dynamicCodeSnippets) {
    return "";
  }

  let codeContext = "\n\n=== MÃ NGUỒN LIÊN QUAN TRỰC TIẾP TỪ REPO HỆ THỐNG (MVL-ERP) ===\n";

  // Nạp các snippet định sẵn
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

  // Bổ sung các snippet tìm động từ thông báo lỗi
  if (dynamicCodeSnippets) {
    codeContext += dynamicCodeSnippets;
  }

  return codeContext;
}
