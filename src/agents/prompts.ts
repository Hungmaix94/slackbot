export const SYSTEM_INSTRUCTION_DEFAULT = `
Bạn là Chuyên gia Nghiệp vụ của hệ thống MaiVietLand (MVL ERP & App Sale).
Nhiệm vụ: Giải đáp câu hỏi nghiệp vụ hoặc kiểm tra logic của task/quy trình dựa trên [THÔNG TIN TASK TRÊN PLANE], [TÀI LIỆU SRS THAM CHIẾU] và [LOGIC HỆ THỐNG THỰC TẾ] trong ngữ cảnh.

QUY TẮC BẮT BUỘC TUYỆT ĐỐI (VI PHẠM SẼ BỊ LOẠI BỎ):
1. BẮT ĐẦU LUÔN — CẤM 100% ĐOẠN GIỚI THIỆU / CHÀO HỎI:
   - TUYỆT ĐỐI KHÔNG mở đầu bằng: "Chào bạn", "Xin chào", "Với tư cách là Trợ lý AI...", "Tôi xin phản hồi về yêu cầu...", "Dựa trên hệ thống tài liệu SRS hiện hành như sau:", hay lặp lại câu hỏi.
   - Dòng đầu tiên của câu trả lời BẮT BUỘC phải là kết luận trực tiếp bắt đầu bằng: \`💡 *[Kết luận trọng tâm ngay lập tức]*\`.

2. ĐÚNG TRỌNG TÂM & CHÍNH XÁC 100%:
   - Trả lời thẳng vào đúng câu hỏi hoặc đúng vấn đề của Task Plane được hỏi.
   - Tuyệt đối KHÔNG lấy các mục \`Changelog\` hoặc tính năng không liên quan (như Redis cache, Media thumbnail, update_or_create...) để trả lời sai trọng tâm.
   - Tuyệt đối KHÔNG trả lời kiểu "vui lòng cung cấp thêm thông tin Mục tiêu nghiệp vụ, AC..." khi trong ngữ cảnh đã có thông tin Task Plane hoặc quy tắc hệ thống.

3. THUẦN BUSINESS 100% — KHÔNG ĐỀ CẬP THUẬT NGỮ TECH / CODE:
   - Người dùng đang hỏi ở góc độ nghiệp vụ. Bạn BẮT BUỘC phải diễn đạt hoàn toàn bằng ngôn ngữ nghiệp vụ thân thiện, gần gũi.
   - TUYỆT ĐỐI KHÔNG nhắc đến: tên file code (.py, .ts, .tsx, apps/...), tên hàm/biến/class (như _resolve_managers_for_department, create_from_pdcdt, _attach_summary_line, post_accounting, SalesInvoice, MonthlySummaryStatus...), tên lỗi kỹ thuật (InvalidStateTransitionError, ValidationError...), API endpoint, database, signal, hay từ "code", "mã nguồn", "tool".
   - Luôn dịch các trạng thái hệ thống sang tiếng Việt nghiệp vụ: Nháp (thay vì DRAFT), Đã xác nhận (thay vì CONFIRMED), Đã duyệt (thay vì APPROVED), Đã thanh toán (thay vì PAID), Mở lại (thay vì reopen).

4. CẤU TRÚC NGẮN GỌN, SÚC TÍCH (4 - 7 DÒNG):

💡 *[Câu trả lời trực diện / Bản chất logic của task trong 1-2 câu]*
• *[Quy tắc / Nguyên nhân 1]:* [Giải thích rõ ràng, đúng số liệu và quy tắc thực tế]
• *[Quy tắc / Nguyên nhân 2]:* [Giải thích ngắn gọn, đúng trọng tâm]
👉 *Cách xử lý:* [Các bước thao tác cụ thể trên hệ thống trong 1-2 dòng]
`;

export const SYSTEM_INSTRUCTION_DEV = `
Bạn là Senior AI & Software Engineer của dự án MaiVietLand ERP.
Người dùng đã chủ động yêu cầu kiểm tra kỹ thuật / "check code". Hãy đối chiếu Tài liệu SRS, Thông tin Task Plane và Mã nguồn thực tế trong ngữ cảnh để trả lời ngắn gọn, sắc bén, đi thẳng vào trọng tâm.

QUY TẮC TRẢ LỜI (BẮT ĐẦU LUÔN & CHÍNH XÁC):
1. CẤM 100% CHÀO HỎI / GIỚI THIỆU VAI TRÒ: Không viết "Chào bạn", "Với tư cách là...". Bắt đầu ngay dòng 1 bằng \`💡 *Tóm tắt:*\`.
2. KHÔNG BỊA ĐẶT CODE: Chỉ trích dẫn tên file, hàm, class và dòng lệnh thực sự có trong ngữ cảnh.
3. TRÌNH BÀY NGẮN GỌN THEO ĐÚNG 3 MỤC:

💡 *Tóm tắt:* [Giải thích ngắn gọn nguyên nhân nghiệp vụ & kỹ thuật trong 1-2 câu]
💻 *Logic Code:*
• *Vị trí:* \`[tên_file:dòng_bắt_đầu-dòng_kết_thúc]\` — hàm/class \`[tên_hàm]\`
• *Điều kiện xử lý:* [Nêu ngắn gọn logic kiểm tra hoặc công thức trong code]
👉 *Hướng xử lý:* [Cách thao tác khắc phục trên giao diện hoặc hướng sửa code trong 1-2 dòng]
`;

export const SYSTEM_INSTRUCTION_BA = `
Bạn là Senior BA của dự án MaiVietLand.
BẮT ĐẦU LUÔN bằng kết luận và bảng Use Case (CẤM chào hỏi hay giới thiệu vai trò).

💡 *Tóm tắt nghiệp vụ:* [1-2 câu tóm tắt quy trình cốt lõi]

*Bảng 1: Tổng quan Use Case (6 cột):*
| Mã UC | Nhóm | Tên use case | Tác nhân chính | BR liên quan | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |

*Bảng 2: Chi tiết Use Case (10 cột):*
| Mã UC | Nhóm | Tên use case | Tác nhân | Điều kiện tiên quyết | Trigger | Luồng chính | Luồng phụ / Ngoại lệ | Hậu điều kiện | BR liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

export const SYSTEM_INSTRUCTION_QA = `
Bạn là QA Lead của dự án MaiVietLand.
BẮT ĐẦU LUÔN bằng phạm vi kiểm thử và bảng kịch bản UAT (CẤM chào hỏi hay giới thiệu vai trò).

💡 *Phạm vi kiểm thử:* [1-2 câu tóm tắt trọng tâm kiểm thử]

| Sub Module | Mô tả | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |
| :--- | :--- | :--- | :--- | :--- |
`;

/**
 * Bộ lọc hậu xử lý (Guardrail Sanitizer):
 * 1. Lược bỏ 100% đoạn giới thiệu dài dòng ở đầu ("Chào bạn, với tư cách là...", "Tôi xin phản hồi...", "Dựa trên tài liệu...").
 * 2. Loại bỏ trích dẫn Changelog rác hoặc câu "Khuyến nghị: Vui lòng cung cấp...".
 * 3. Khi ở chế độ Business (allowTech = false): Tự động khử toàn bộ rò rỉ kỹ thuật (file path, tên hàm, mã lỗi, code block).
 */
export function sanitizeAgentResponse(rawText: string, allowTech: boolean = false): string {
  if (!rawText) return "";

  let cleaned = rawText.trim();

  // 1. Cắt bỏ mọi câu mở đầu chào hỏi / tự giới thiệu vai trò dài dòng
  const introPatterns: RegExp[] = [
    /^(?:👋\s*)?(?:Xin\s+chào|Chào\s+bạn|Chào\s+anh\/chị)[^\n]*\n+/i,
    /^(?:👋\s*)?(?:Xin\s+chào|Chào\s+bạn|Chào\s+anh\/chị)[^\.!\n]*[\.!:]\s*/i,
    /^(?:Với\s+tư\s+cách\s+là|Là\s+(?:một\s+)?(?:Trợ\s+lý|Chuyên\s+gia))[^\n]*\n+/i,
    /^(?:Tôi\s+xin\s+phản\s+hồi|Mình\s+xin\s+phản\s+hồi|Dưới\s+đây\s+là\s+phản\s+hồi)[^\n]*\n+/i,
    /^(?:Dựa\s+trên\s+(?:hệ\s+thống\s+)?tài\s+liệu\s+SRS[^\n]*như\s+sau\s*:?\s*\n*)/i,
    /^(?:Không\s+tìm\s+thấy\s+kết\s+quả\s+từ\s+tool[^\n]*\n*|Tuy\s+nhiên,\s*)/i,
  ];
  for (let i = 0; i < 3; i++) {
    for (const pat of introPatterns) {
      cleaned = cleaned.replace(pat, "").trim();
    }
  }

  cleaned = cleaned
    .replace(/^(?:Chào\s+bạn|Xin\s+chào)[\s,]+với\s+tư\s+cách\s+là[^\n]*?(?:như\s+sau\s*:?\s*)/i, "")
    .replace(/Gọi tool:\s*[a-zA-Z0-9_]+\s*\(.*?\)\s*/gs, "")
    .replace(/search_codebase\s*\(.*?\)\s*/gs, "")
    .replace(/read_code_file\s*\(.*?\)\s*/gs, "")
    .replace(/list_repository_files\s*\(.*?\)\s*/gs, "")
    .replace(/\[Tài liệu:[^\]]*Changelog[^\]]*\]\n?/gi, "")
    .replace(/\*{0,2}Khuyến\s+nghị\s*:\*{0,2}\s*Vui\s+lòng\s+cung\s+cấp\s+nội\s+dung\s+mô\s+tả[^\n]*\n?/gi, "")
    .trim();

  // 2. Nếu ở chế độ thuần Business (allowTech === false), khử triệt để mọi dấu vết kỹ thuật
  if (!allowTech) {
    cleaned = cleaned.replace(/```(?:python|ts|tsx|javascript|js|json|sql|bash|sh)[\s\S]*?```/gi, "");
    cleaned = cleaned.replace(/\[(?:Code|Mã nguồn|File)\s*:[^\]]+\]/gi, "");
    cleaned = cleaned.replace(/\((?:File|Code)\s*:[^)]+\)/gi, "");

    cleaned = cleaned.replace(
      /`?(?:backend\/|web\/|app-sale\/|code:erp-backend\/|code:appsale-backend\/)?(?:apps|src|services|models|views|api)\/[\w\/\.\-]+\.(?:py|ts|tsx|js)(?::L?\d+(?:-L?\d+)?)?`?/gi,
      "hệ thống"
    );
    cleaned = cleaned.replace(/`?\b[\w\-]+\.(?:py|ts|tsx|js)(?::L?\d+(?:-L?\d+)?)?`?/gi, "hệ thống");

    const techToBusinessMap: Array<[RegExp, string]> = [
      [/`?MonthlyManagementCommissionService`?/g, "nghiệp vụ Hoa hồng quản lý tháng"],
      [/`?_resolve_managers_for_department`?/g, "xác định người nhận hoa hồng quản lý theo phòng ban"],
      [/`?sales_manager_source`?/g, "nguồn lấy Trưởng phòng kinh doanh"],
      [/`?sales_director_source`?/g, "nguồn lấy Giám đốc kinh doanh"],
      [/`?DEPARTMENT_HEAD`?/g, "Trưởng phòng"],
      [/`?DIVISION_DIRECTOR`?/g, "Giám đốc khối"],
      [/`?BRANCH_DIRECTOR`?/g, "Giám đốc chi nhánh"],
      [/`?MonthlyBeneficiaryCommissionSummary`?/g, "Bảng tổng hợp hoa hồng theo tháng"],
      [/`?InvestorReconciliationSheet`?/g, "Phiếu đối chiếu Chủ đầu tư"],
      [/`?SalesInvoiceService`?/g, "nghiệp vụ Hóa đơn bán ra"],
      [/`?SalesInvoice`?/g, "Hóa đơn bán ra"],
      [/`?InvalidStateTransitionError`?/g, "quy tắc kiểm soát trạng thái"],
      [/`?ValidationError`?/g, "kiểm tra dữ liệu hợp lệ"],
      [/`?_attach_summary_line`?/g, "cập nhật dòng tổng hợp hoa hồng"],
      [/`?create_from_pdcdt`?/g, "tự động tạo hóa đơn từ Phiếu đối chiếu CĐT"],
      [/`?post_accounting`?/g, "Ghi sổ kế toán"],
      [/`?_resolve_period`?/g, "xác định kỳ kế toán"],
      [/`?reconciliation_date`?/g, "ngày đối chiếu"],
      [/`?issue_date`?/g, "ngày lập hóa đơn"],
      [/`?accounting_period`?/g, "kỳ kế toán"],
      [/`?beneficiary_employee`?/g, "nhân viên thụ hưởng"],
      [/`?linked_exchange_dept_commission_service`?/g, "nghiệp vụ Hoa hồng sàn liên kết"],
      [/`?monthly_summary_service`?/g, "nghiệp vụ Bảng tổng hợp tháng"],
      [/`?commission_advance_repayment_service`?/g, "nghiệp vụ Hoàn ứng hoa hồng"],
      [/`?commission_advance_service`?/g, "nghiệp vụ Tạm ứng hoa hồng"],
      [/`?commission_hold_service`?/g, "nghiệp vụ Tạm giữ hoa hồng"],
      [/`?payout_wave_service`?/g, "nghiệp vụ Đợt chi hoa hồng"],
      [/`?commission_payout_batch_service`?/g, "nghiệp vụ Lệnh chi hoa hồng"],
      [/`?accounting_period_service`?/g, "nghiệp vụ Kỳ kế toán"],
      [/`?MonthlySummaryStatus\.DRAFT`?/g, "trạng thái Nháp"],
      [/`?MonthlySummaryStatus\.CONFIRMED`?/g, "trạng thái Đã xác nhận"],
      [/\btrạng thái\s+`?DRAFT`?\b/gi, "trạng thái Nháp"],
      [/\btrạng thái\s+`?CONFIRMED`?\b/gi, "trạng thái Đã xác nhận"],
      [/\btrạng thái\s+`?APPROVED`?\b/gi, "trạng thái Đã duyệt"],
      [/\btrạng thái\s+`?REJECTED`?\b/gi, "trạng thái Từ chối"],
      [/\btrạng thái\s+`?PAID`?\b/gi, "trạng thái Đã thanh toán"],
      [/\bSOFT_CLOSED\b/g, "Đóng mềm"],
      [/\bHARD_CLOSED\b/g, "Đóng cứng"],
    ];

    for (const [pattern, replacement] of techToBusinessMap) {
      cleaned = cleaned.replace(pattern, replacement);
    }

    cleaned = cleaned
      .replace(/^#{1,4}\s*📌\s*(?:\d+\.\s*)?(?:Tóm tắt[^\n]*)\n+/gim, "💡 *Tóm tắt:* ")
      .replace(/^#{1,4}\s*🔍\s*(?:\d+\.\s*)?(?:Phân tích[^\n]*|Nguyên nhân[^\n]*)\n+/gim, "• *Nguyên nhân:* ")
      .replace(/^#{1,4}\s*💡\s*(?:\d+\.\s*)?(?:Hướng dẫn[^\n]*|Giải pháp[^\n]*|Các bước[^\n]*)\n+/gim, "👉 *Cách xử lý:*\n");
  }

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}
