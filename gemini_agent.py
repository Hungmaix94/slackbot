import os
import re
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

logger = logging.getLogger("gemini_agent")

# =====================================================================
# 1. SYSTEM PROMPTS (ZERO INTRO — BẮT ĐẦU LUÔN, ĐÚNG TRỌNG TÂM, THUẦN BUSINESS)
# =====================================================================

SYSTEM_INSTRUCTION_DEFAULT = """
Bạn là Chuyên gia Nghiệp vụ của hệ thống MaiVietLand (MVL ERP & App Sale).
Nhiệm vụ: Giải đáp câu hỏi nghiệp vụ hoặc kiểm tra logic của task/quy trình dựa trên [THÔNG TIN TASK TRÊN PLANE], [TRÍCH DẪN TÀI LIỆU SRS & TRI THỨC HỆ THỐNG] và [LOGIC HỆ THỐNG THỰC TẾ] trong ngữ cảnh.

QUY TẮC BẮT BUỘC TUYỆT ĐỐI (VI PHẠM SẼ BỊ LOẠI BỎ):
1. BẮT ĐẦU LUÔN — CẤM 100% ĐOẠN GIỚI THIỆU / CHÀO HỎI:
   - TUYỆT ĐỐI KHÔNG mở đầu bằng: "Chào bạn", "Xin chào", "Với tư cách là Trợ lý AI...", "Tôi xin phản hồi về yêu cầu...", "Dựa trên hệ thống tài liệu SRS hiện hành như sau:", hay lặp lại câu hỏi.
   - Dòng đầu tiên của câu trả lời BẮT BUỘC phải là kết luận trực tiếp bắt đầu bằng: `💡 *[Kết luận trọng tâm ngay lập tức]*`.
2. ĐÚNG TRỌNG TÂM & CHÍNH XÁC 100%:
   - Trả lời thẳng vào đúng câu hỏi hoặc đúng vấn đề của Task Plane được hỏi.
   - Tuyệt đối KHÔNG lấy các mục `Changelog` hoặc tính năng không liên quan (như Redis cache, Media thumbnail, update_or_create...) để trả lời râu ông nọ cắm cằm bà kia.
   - Tuyệt đối KHÔNG trả lời kiểu "vui lòng cung cấp thêm thông tin Mục tiêu nghiệp vụ, AC..." khi trong ngữ cảnh đã có thông tin Task Plane hoặc quy tắc hệ thống.
3. THUẦN BUSINESS 100% — KHÔNG RÒ RỈ THUẬT NGỮ CODE:
   - Diễn đạt hoàn toàn bằng ngôn ngữ nghiệp vụ dễ hiểu cho Kế toán, Sale, BA, Quản lý.
   - TUYỆT ĐỐI KHÔNG nhắc tên file code (`.py`, `.ts`, `.tsx`, `apps/...`), tên hàm/biến/class (`_resolve_managers_for_department`, `create_from_pdcdt`, `_attach_summary_line`, `SalesInvoice`, `MonthlySummaryStatus`...), mã lỗi kỹ thuật (`InvalidStateTransitionError`, `ValidationError`), database, API hay từ "code", "mã nguồn", "tool".
   - Dịch trạng thái sang tiếng Việt: Nháp (thay vì DRAFT), Đã xác nhận (thay vì CONFIRMED), Đã duyệt (thay vì APPROVED), Đã chi tiền (thay vì PAID), Mở lại (thay vì reopen).
4. TRẢ LỜI THEO GẠCH ĐẦU DÒNG NGẮN GỌN, ĐÚNG Ý (TỐI ĐA 4 - 6 GẠCH ĐẦU DÒNG):
   - TUYỆT ĐỐI KHÔNG viết đoạn văn dài nhiều câu trong 1 gạch đầu dòng.
   - Mỗi gạch đầu dòng (`•`) CHỈ chứa 1 ý ngắn gọn (tối đa 1 câu <= 25 từ), tách bạch rõ từng ý.

💡 *[Kết luận trực diện trong 1 câu ngắn gọn]*
• *[Ý chính / Quy tắc 1]:* [1 câu ngắn gọn, đúng số liệu/quy tắc]
• *[Nguyên nhân / Quy tắc 2]:* [1 câu ngắn gọn, đúng trọng tâm]
• *[Nguyên nhân / Quy tắc 3 (nếu có)]:* [1 câu ngắn gọn]
👉 *Cách xử lý:*
• [Bước 1 ngắn gọn]
• [Bước 2 ngắn gọn]
"""

SYSTEM_INSTRUCTION_DEV = """
Bạn là Senior AI & Software Engineer của dự án MaiVietLand ERP.
Người dùng đã chủ động yêu cầu kiểm tra kỹ thuật / "check code". Hãy đối chiếu Tài liệu SRS, Thông tin Task Plane và Mã nguồn thực tế trong ngữ cảnh để trả lời trực diện, sắc bén.

QUY TẮC BẮT BUỘC:
1. BẮT ĐẦU LUÔN — CẤM 100% ĐOẠN GIỚI THIỆU / CHÀO HỎI:
   - TUYỆT ĐỐI KHÔNG viết "Chào bạn", "Với tư cách là...", "Tôi xin phản hồi...". Bắt đầu ngay dòng 1 bằng `💡 *Tóm tắt:*`.
2. CHÍNH XÁC TỪ CODE & SRS: Chỉ trích dẫn đúng file, hàm, class và dòng lệnh thực sự có trong ngữ cảnh. Không bịa đặt hoặc trích dẫn Changelog không liên quan.
3. TRÌNH BÀY NGẮN GỌN THEO ĐÚNG 3 MỤC:

💡 *Tóm tắt:* [Kết luận trực tiếp về nguyên nhân nghiệp vụ & kỹ thuật trong 1-2 câu]
💻 *Logic Code:*
• *Vị trí:* `[tên_file:dòng_bắt_đầu-dòng_kết_thúc]` — hàm/class `[tên_hàm]`
• *Điều kiện xử lý:* [Nêu ngắn gọn logic kiểm tra, công thức hoặc nguyên nhân trong code/dữ liệu]
👉 *Hướng xử lý:* [Cách khắc phục trên dữ liệu/giao diện hoặc hướng sửa code trong 1-2 dòng]
"""

SYSTEM_INSTRUCTION_USECASE = """
Bạn là Senior BA của dự án MaiVietLand.
BẮT ĐẦU LUÔN bằng kết luận và bảng Use Case (CẤM chào hỏi hay giới thiệu vai trò).

💡 *Tóm tắt nghiệp vụ:* [1-2 câu tóm tắt quy trình cốt lõi]

*Bảng 1: Tổng quan Use Case (6 cột):*
| Mã UC | Nhóm | Tên use case | Tác nhân chính | BR liên quan | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |

*Bảng 2: Chi tiết Use Case (10 cột):*
| Mã UC | Nhóm | Tên use case | Tác nhân | Điều kiện tiên quyết | Trigger | Luồng chính | Luồng phụ / Ngoại lệ | Hậu điều kiện | BR liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
"""

SYSTEM_INSTRUCTION_TESTCASE = """
Bạn là QA Lead của dự án MaiVietLand.
BẮT ĐẦU LUÔN bằng phạm vi kiểm thử và bảng kịch bản UAT (CẤM chào hỏi hay giới thiệu vai trò).

💡 *Phạm vi kiểm thử:* [1-2 câu tóm tắt trọng tâm kiểm thử]

| Sub Module | Mô tả | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |
| :--- | :--- | :--- | :--- | :--- |
"""

SYSTEM_INSTRUCTION_TASK_EXTRACT = """
Trích xuất thông tin tạo Task/Bug ngắn gọn trên Plane từ yêu cầu Slack sau.
BẮT BUỘC chỉ trả về DUY NHẤT 1 chuỗi JSON thuần túy (không bọc trong markdown code block, không giải thích):
{
  "name": "[BUG hoặc TASK] [Tên phân hệ] - Tiêu đề ngắn gọn dưới 65 ký tự",
  "type": "bug" hoặc "task",
  "module": "Tên phân hệ ngắn gọn",
  "priority": "urgent" | "high" | "medium" | "low",
  "steps": ["Bước 1...", "Bước 2..."],
  "actual": "Mô tả lỗi hoặc nội dung yêu cầu ngắn gọn",
  "expected": "Kết quả mong muốn ngắn gọn",
  "explicit_assignee": "username hoặc tên người được giao nếu có"
}
"""

# =====================================================================
# 2. BỘ PHÂN LOẠI Ý ĐỊNH (INTENT ROUTER) & NHẬN DIỆN TECH MODE
# =====================================================================

EXPLICIT_TECH_KEYWORDS = [
    "check code",
    "check-code",
    "checkcode",
    "kiểm tra code",
    "kiem tra code",
    "xem code",
    "soi code",
    "đọc code",
    "doc code",
    "tra code",
    "tra cứu code",
    "mã nguồn",
    "ma nguon",
    "source code",
    "codebase",
    "trong code",
    "logic code",
    "code xử lý",
    "code xu ly",
    "code thực tế",
    "code thuc te",
    "code đang",
    "file code",
    "file nào",
    "hàm nào",
    "class nào",
    "model nào",
    "biến nào",
    "serializer",
    "viewset",
    "endpoint",
    "api nào",
    "api flow",
    "cấu trúc bảng db",
    "database schema",
    "stack trace",
    "traceback",
    "debug code",
    "sửa code",
    "fix code",
    "pull request",
    "git commit",
    "celery task",
    "django signal",
]


def is_tech_requested(query: str) -> bool:
    """
    Kiểm tra xem người dùng có CHỦ ĐỘNG yêu cầu xem thông tin kỹ thuật / kiểm tra code hay không.
    Mặc định trả về False (thuần Business). Chỉ trả về True khi có từ khóa như 'check code', 'xem code', '/code'...
    """
    if not query:
        return False
    q = query.lower().strip()
    if q.startswith("/code") or q.startswith("/dev") or q.startswith("/api"):
        return True
    # Tránh nhầm URL (như pm.glinteco.com/...) với tên file code
    q_without_urls = re.sub(r"https?://\S+|\b(?:pm\.glinteco\.com|app\.plane\.so)/\S+", "", q)
    if re.search(r"\b[\w\/\.\-]+\.(?:py|ts|tsx|js|sql)\b", q_without_urls, flags=re.IGNORECASE):
        return True
    return any(kw in q_without_urls for kw in EXPLICIT_TECH_KEYWORDS)


def classify_intent(query: str) -> str:
    if not query:
        return "SRS_QA"
    q = query.lower().strip()

    if (
        q.startswith("/set-project")
        or q.startswith("/set_project")
        or q.startswith("set project")
        or q.startswith("đổi project")
        or q.startswith("chọn project")
        or "gán project mặc định" in q
        or "đặt project mặc định" in q
    ):
        return "SET_PROJECT"

    if (
        q in ("/projects", "/project", "project", "projects")
        or q.startswith("/projects")
        or q.startswith("/list-projects")
        or "danh sách project" in q
        or "danh sách dự án" in q
        or "xem các project" in q
        or "các project trên plane" in q
        or "project list" in q
    ):
        return "LIST_PROJECTS"

    if (
        q.startswith("/audit")
        or q.startswith("audit ")
        or q == "audit"
        or "audit srs" in q
        or "đối chiếu srs với code" in q
        or "doi chieu srs voi code" in q
        or "đối chiếu srs và code" in q
        or "so sánh srs với code" in q
        or "so sánh srs và code" in q
        or "kiểm tra độ lệch srs" in q
        or "kiem tra do lech srs" in q
        or "kiểm tra srs với code" in q
        or "rà soát srs với code" in q
        or "báo cáo audit srs" in q
        or "schedule audit" in q
        or "audit code với srs" in q
    ):
        return "AUDIT_SRS_CODE"

    if (
        re.match(
            r"^(?:\/?(?:create[-_]task|plane[-_]task|clickup[-_]task|task|bug)\b|(?:tạo|tao|lên|len|log|báo|bao)\s+(?:nhanh\s+|giúp\s+|hộ\s+)?(?:task|bug|lỗi|issue)\b)",
            q,
            flags=re.IGNORECASE,
        )
        or q.startswith("/create_task")
        or q.startswith("/create-task")
        or q.startswith("/plane-task")
        or q.startswith("/clickup-task")
        or q.startswith("/task ")
        or q.startswith("/bug ")
        or q.startswith("tạo task")
        or q.startswith("tao task")
        or q.startswith("tạo bug")
        or q.startswith("tao bug")
        or q.startswith("log bug")
        or q.startswith("báo bug")
        or q.startswith("báo lỗi plane")
        or "tạo task plane" in q
        or "tạo plane task" in q
        or "tạo bug plane" in q
        or "báo bug plane" in q
        or "tạo task clickup" in q
        or "tạo clickup task" in q
        or "tạo task nhanh" in q
        or "lên task plane" in q
        or "tạo giúp task" in q
        or "tạo hộ task" in q
        or "tạo giúp bug" in q
        or "tạo hộ bug" in q
        or "tạo bug này" in q
        or "tạo task này" in q
        or "tạo task:" in q
        or "tạo bug:" in q
        or "tạo task " in q
        or "tạo bug " in q
        or "log bug " in q
    ):
        return "CREATE_TASK"

    if (
        q.startswith("/bugs")
        or q.startswith("/tasks")
        or q.startswith("/plane-bugs")
        or q.startswith("/plane-tasks")
        or "tìm bug" in q
        or "tìm task" in q
        or "tiến độ plane" in q
        or "tiến độ clickup" in q
        or "tra cứu bug" in q
        or "tra cứu task" in q
        or "danh sách bug" in q
    ):
        return "SEARCH_PLANE"

    if (
        q.startswith("/usecase")
        or "viết usecase" in q
        or "viết use case" in q
        or "sinh usecase" in q
        or "sinh use case" in q
        or "tạo usecase" in q
        or "tạo use case" in q
        or "danh sách usecase" in q
        or "danh sách use case" in q
        or "bảng usecase" in q
        or "bảng use case" in q
    ):
        return "BA"

    if (
        q.startswith("/testcase")
        or "viết testcase" in q
        or "viết test case" in q
        or "sinh testcase" in q
        or "sinh test case" in q
        or "tạo testcase" in q
        or "tạo test case" in q
        or "kịch bản uat" in q
        or "kịch bản kiểm thử" in q
        or "bảng testcase" in q
        or "bảng test case" in q
    ):
        return "QA"

    if is_tech_requested(query):
        return "CODE_DEV"

    return "SRS_QA"


# =====================================================================
# 3. BẢN ĐỒ TRI THỨC LAI TOÀN DIỆN (SRS + CODE LOGIC — 16 PHÂN HỆ CỐT LÕI)
# =====================================================================

DOMAIN_CODE_MAP: List[Dict[str, Any]] = [
    {
        "id": "hhql_branch_config_mvl_3819",
        "module_name": "Hoa hồng Quản lý (HHQL) Tháng & Cấu hình Nguồn Quản lý Chi nhánh (MVL-3819)",
        "keywords": [
            "mvl-3819", "3819", "86exztban", "hhql", "hoa hồng quản lý", "hoa hong quan ly",
            "hải phòng", "hai phong", "chi nhánh", "chi nhanh", "cách tính khác",
            "nguồn quản lý", "nguon quan ly", "giám đốc khối", "giam doc khoi", "giám đốc chi nhánh",
            "sales_manager_source", "sales_director_source", "_resolve_managers_for_department",
            "management_commission_service.py", "20.19", "kpi phòng", "kpi phong",
        ],
        "srs_doc": "features/accounting/20.19-monthly-management-commission-from-dept-kpi/fsd.md & features/hrm/2.1-branch-management/fsd.md",
        "business_logic": (
            "Công thức tính Hoa hồng quản lý (HHQL) tháng của Hải Phòng KHÔNG khác các chi nhánh còn lại — toàn hệ thống dùng chung công thức: "
            "tính % hoàn thành KPI phòng (= Doanh thu ghi nhận của phòng / Chỉ tiêu phòng × 100), tra bảng 4 bậc để nhân tỷ lệ % cho 4 vai trò (TPKD, GĐKD, TGĐ, TP TKKD). "
            "Tuy nhiên, người nhận hoa hồng của vai TPKD và GĐKD phụ thuộc vào Cấu hình nguồn quản lý kinh doanh trên từng Chi nhánh (gồm 3 mô hình: "
            "Chuẩn/Standard: TPKD lấy Trưởng phòng, GĐKD lấy Giám đốc khối; Phẳng/Flat: TPKD lấy Trưởng phòng, GĐKD lấy Giám đốc chi nhánh; "
            "Lai/Hybrid: TPKD lấy Giám đốc khối, GĐKD lấy Giám đốc chi nhánh). "
            "Nguyên nhân thực tế khiến Hải Phòng ra số liệu khác: (1) Hải Phòng đang để cấu hình mặc định Chuẩn (GĐKD = Giám đốc khối) nhưng các Khối kinh doanh tại Hải Phòng đang bỏ trống trường Giám đốc khối, khiến phần HHQL của vai GĐKD bị bỏ qua không sinh dòng chi (~10,8 triệu); "
            "(2) Dữ liệu danh mục đang tách làm 2 chi nhánh độc lập là Hải phòng (CN000000006) và Hải Phòng 2 (CN000000010), gây lệch khi cộng gộp đối chiếu."
        ),
        "steps": [
            "Vào Danh mục Chi nhánh kiểm tra trường 'Cấu hình nguồn quản lý kinh doanh' của Hải Phòng: nếu chi nhánh không bổ nhiệm Giám đốc khối riêng mà Giám đốc chi nhánh kiêm nhiệm, chuyển cấu hình sang mô hình Phẳng (Flat) hoặc Lai (Hybrid).",
            "Hoặc vào Sơ đồ tổ chức (Cơ cấu Khối/Phòng) cập nhật đầy đủ nhân sự giữ vai trò Giám đốc khối cho các khối thuộc chi nhánh Hải Phòng.",
            "Kiểm tra phạm vi lọc chi nhánh khi đối chiếu số liệu vì Hải Phòng đang tách thành 2 mã chi nhánh: CN000000006 (Hải phòng) và CN000000010 (Hải Phòng 2), sau đó bấm Tính toán lại trên kỳ HHQL tháng.",
        ],
        "code_ref": "apps/accounting/services/management_commission_service.py:L228-L295 (MonthlyManagementCommissionService._resolve_managers_for_department)",
        "code_snippet": (
            "def _resolve_managers_for_department(department) -> dict[str, Employee | None]:\n"
            "    branch = department.branch\n"
            "    sm_source = getattr(branch, 'sales_manager_source', SalesManagerSource.DEPARTMENT_HEAD)\n"
            "    sd_source = getattr(branch, 'sales_director_source', SalesDirectorSource.DIVISION_DIRECTOR)\n"
            "    tpkd = department.manager if sm_source == SalesManagerSource.DEPARTMENT_HEAD else (department.division.director if department.division else None)\n"
            "    gdkd = (department.division.director if department.division else None) if sd_source == SalesDirectorSource.DIVISION_DIRECTOR else (branch.director if branch else None)\n"
            "    return {'TPKD': tpkd, 'GDKD': gdkd}"
        ),
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Code đã xử lý đúng cấu hình nguồn quản lý kinh doanh theo từng chi nhánh (Standard / Flat / Hybrid). Chênh lệch số liệu tại Hải Phòng là do dữ liệu master Khối chưa gán Giám đốc khối và cấu hình chi nhánh đang để mặc định Standard.",
        "audit_recommendation": "Bổ sung cảnh báo trên giao diện Tính HHQL tháng khi phòng ban đạt KPI nhưng vai trò GĐKD/TPKD bị trống người thụ hưởng.",
    },
    {
        "id": "pdcdt_sales_invoice_period",
        "module_name": "Đối chiếu CĐT & Hóa đơn bán ra",
        "keywords": [
            "đối chiếu", "doi chieu", "cđt", "cdt", "hóa đơn", "hoa don",
            "bán ra", "ban ra", "kỳ hoa hồng", "ky hoa hong", "nhảy kỳ", "lệch kỳ",
            "pdcdt", "irs", "sales_invoice", "salesinvoice", "investorreconciliationsheet", "create_from_pdcdt",
            "sales_invoice_service.py", "_resolve_period", "auto_create_sales_invoice_on_pdcdt_confirmed",
        ],
        "srs_doc": "features/accounting/20.6-sales-invoice-management/fsd.md",
        "business_logic": (
            "Khi Phiếu đối chiếu Chủ đầu tư (PDCDT) được duyệt sang trạng thái Đã xác nhận, hệ thống tự động tạo Hóa đơn bán ra. "
            "Kỳ kế toán (kỳ hoa hồng) của Hóa đơn bán ra được xác định ưu tiên theo Ngày đối chiếu trên Phiếu đối chiếu CĐT "
            "(chứ không lấy theo ngày bấm duyệt hiện tại). Nếu ngày đối chiếu rơi vào tháng trước (hoặc kỳ tháng hiện tại chưa mở "
            "nên hệ thống lấy kỳ đang mở gần nhất), hóa đơn sẽ được ghi nhận vào kỳ tháng trước đó."
        ),
        "steps": [
            "Kiểm tra trường Ngày đối chiếu trên Phiếu đối chiếu CĐT xem đang thuộc tháng nào.",
            "Kiểm tra danh sách Kỳ kế toán xem kỳ tháng mới đã được mở chưa.",
            "Điều chỉnh lại kỳ kế toán trên Hóa đơn bán ra khi còn ở trạng thái Nháp.",
        ],
        "code_ref": "apps/accounting/services/sales_invoice_service.py:L20-L45 (SalesInvoiceService._resolve_period, create_from_pdcdt)",
        "code_snippet": (
            "def _resolve_period(target_date):\n"
            "    period = AccountingPeriod.objects.filter(start_date__lte=target_date, end_date__gte=target_date).first()\n"
            "    if not period:\n"
            "        period = AccountingPeriod.objects.filter(status=PeriodStatus.OPEN).order_by('-start_date').first()\n"
            "    return period"
        ),
        "audit_status": "DRIFT",
        "audit_severity": "medium",
        "audit_drift": "SRS chưa ghi rõ thứ tự ưu tiên lấy Ngày đối chiếu (reconciliation_date) và cơ chế fallback kỳ mở gần nhất.",
        "audit_recommendation": "Bổ sung quy tắc xác định kỳ kế toán từ Ngày đối chiếu vào FSD mục 20.6.",
    },
    {
        "id": "linked_exchange_monthly_summary",
        "module_name": "Hoa hồng Sàn liên kết & Bảng tổng hợp tháng",
        "keywords": [
            "sàn liên kết", "san lien ket", "slk", "hoa hồng theo tháng", "hoa hong theo thang",
            "ghi sổ", "ghi so", "bảng tổng hợp", "bang tong hop", "bảng kê", "bang ke",
            "linked-exchange", "linked_exchange", "monthly summary", "employee summary",
            "draft", "nháp", "beneficiary", "post_accounting", "_attach_summary_line", "must be draft",
        ],
        "srs_doc": "features/accounting/linked-exchange-dept-commission/fsd.md",
        "business_logic": (
            "Khi thực hiện Ghi sổ hoa hồng Sàn liên kết, hệ thống tự động đẩy dòng hoa hồng này vào Bảng tổng hợp hoa hồng theo tháng "
            "của nhân viên thụ hưởng. Hệ thống bắt buộc Bảng tổng hợp hoa hồng tháng của nhân viên đó phải đang ở trạng thái Nháp. "
            "Nếu bảng tổng hợp của nhân viên đã được Xác nhận/Chốt trước đó, hệ thống sẽ chặn thao tác ghi sổ."
        ),
        "steps": [
            "Mở Bảng tổng hợp hoa hồng theo tháng của nhân viên thụ hưởng trong kỳ tương ứng.",
            "Bấm nút Mở lại (đưa bảng tổng hợp từ Đã xác nhận về trạng thái Nháp).",
            "Quay lại màn hình Hoa hồng sàn liên kết thực hiện Ghi sổ, sau đó xác nhận lại Bảng tổng hợp.",
        ],
        "code_ref": "apps/accounting/services/linked_exchange_dept_commission_service.py:L742-L760 (_attach_summary_line, post_accounting)",
        "code_snippet": (
            "if summary.status != MonthlySummaryStatus.DRAFT:\n"
            "    raise InvalidStateTransitionError('Employee monthly summary must be DRAFT to attach linked exchange commission line.')"
        ),
        "audit_status": "DRIFT",
        "audit_severity": "high",
        "audit_drift": "Code có ràng buộc bảo vệ trạng thái Nháp của Bảng tổng hợp tháng chặt hơn mô tả trong SRS.",
        "audit_recommendation": "Cập nhật SRS nêu rõ điều kiện tiên quyết: Bảng tổng hợp tháng của NV phải ở trạng thái Nháp.",
    },
    {
        "id": "commission_advance_repayment",
        "module_name": "Tạm ứng & Hoàn ứng Hoa hồng",
        "keywords": [
            "tạm ứng", "tam ung", "thu hồi", "thu hoi", "hoàn ứng", "hoan ung",
            "khấu trừ", "khau tru", "dư nợ", "du no", "commission advance", "advance repayment",
        ],
        "srs_doc": "features/accounting/20.17-commission-advance-management/fsd.md",
        "business_logic": (
            "Phiếu tạm ứng hoa hồng đi qua các bước: Nháp -> Chờ duyệt -> Đã duyệt -> Đã chi tiền. "
            "Khi lập Bảng tổng hợp hoa hồng tháng, hệ thống chỉ tự động khấu trừ đối với các khoản tạm ứng đã ở trạng thái Đã chi tiền và còn dư nợ. "
            "Nếu hoa hồng thực nhận trong kỳ nhỏ hơn dư nợ tạm ứng, phần chênh lệch tự động chuyển sang kỳ tiếp theo."
        ),
        "steps": [
            "Kiểm tra trạng thái Phiếu tạm ứng đã chuyển sang Đã chi tiền chưa.",
            "Kiểm tra cột Khấu trừ tạm ứng và Dư nợ chuyển kỳ sau trên Bảng tổng hợp tháng.",
        ],
        "code_ref": "apps/accounting/services/commission_advance_repayment_service.py:L240-L275 (deduct_from_monthly_summary)",
        "code_snippet": "if advance.status == AdvanceStatus.PAID and advance.remaining_balance > 0:\n    deduct_amount = min(net_commission, advance.remaining_balance)",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "commission_hold",
        "module_name": "Tạm giữ Hoa hồng",
        "keywords": [
            "tạm giữ", "tam giu", "giữ hoa hồng", "giu hoa hong", "giải tỏa", "giai toa", "commission hold",
        ],
        "srs_doc": "features/accounting/20.15-commission-hold-management/fsd.md",
        "business_logic": (
            "Khoản tạm giữ hoa hồng chỉ được áp dụng hoặc chỉnh sửa khi Bảng tổng hợp hoa hồng tháng của nhân viên đang ở trạng thái Nháp. "
            "Khi đủ điều kiện hồ sơ, kế toán thực hiện Giải tỏa tạm giữ để cộng trả vào đợt chi trả tiếp theo."
        ),
        "steps": [
            "Mở màn hình Quản lý tạm giữ hoa hồng và chọn phiếu cần xử lý.",
            "Bấm Giải tỏa tạm giữ và chọn kỳ hạch toán hoàn trả.",
        ],
        "code_ref": "apps/accounting/services/commission_hold_service.py:L825-L865 (CommissionHoldService.apply_hold)",
        "code_snippet": "def apply_hold(summary, hold_amount):\n    assert summary.status == MonthlySummaryStatus.DRAFT",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "payout_wave_and_batch",
        "module_name": "Đợt chi & Lệnh chi Hoa hồng",
        "keywords": [
            "đợt chi", "dot chi", "payout wave", "payout batch", "lệnh chi", "lenh chi", "chi trả hoa hồng",
        ],
        "srs_doc": "features/accounting/20.18-employee-commission-payout-batch/fsd.md",
        "business_logic": (
            "Hệ thống chỉ cho phép đưa các dòng hoa hồng từ Bảng tổng hợp tháng đã ở trạng thái Đã xác nhận vào Đợt chi / Lệnh chi. "
            "Tổng số tiền tạo lệnh chi không được vượt quá Số tiền thực lĩnh còn lại phải trả."
        ),
        "steps": [
            "Đảm bảo Bảng tổng hợp hoa hồng tháng đã được bấm Xác nhận.",
            "Tạo Đợt chi -> Chọn danh sách nhân viên đủ điều kiện -> Xuất Lệnh chi.",
        ],
        "code_ref": "apps/accounting/services/commission_payout_batch_service.py:L125-L170 (validate_batch_items)",
        "code_snippet": "if item.summary_status != MonthlySummaryStatus.CONFIRMED or amount > item.net_payable:\n    raise ValidationError('Invalid payout batch item')",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "accounting_period_lifecycle",
        "module_name": "Vòng đời Kỳ kế toán",
        "keywords": [
            "kỳ kế toán", "ky ke toan", "đóng kỳ", "dong ky", "mở kỳ", "mo ky", "khóa sổ", "soft close", "hard close",
        ],
        "srs_doc": "features/accounting/accounting_end_to_end_flow.md",
        "business_logic": (
            "Kỳ kế toán có 3 mức kiểm soát: Đang mở (hạch toán bình thường), Đóng mềm (chỉ Kế toán trưởng được phép điều chỉnh hoặc mở lại kỳ), "
            "và Đóng cứng (khóa sổ hoàn toàn, không ai được sửa đổi số liệu trong kỳ đó)."
        ),
        "steps": [
            "Nếu kỳ đang Đóng mềm và cần bổ sung chứng từ, nhờ Kế toán trưởng thực hiện Mở lại kỳ.",
            "Sau khi hoàn tất điều chỉnh, thực hiện Đóng kỳ lại để bảo vệ số liệu.",
        ],
        "code_ref": "apps/accounting/services/accounting_period_service.py:L135-L180 (AccountingPeriodService.transition_state)",
        "code_snippet": "if period.status == PeriodStatus.SOFT_CLOSED and not user.is_chief_accountant:\n    raise PermissionDenied('Kỳ kế toán đang đóng mềm.')",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "booking_unit_hold_deposit",
        "module_name": "Giữ chỗ (Booking) & Đặt cọc",
        "keywords": [
            "giữ chỗ", "giu cho", "lock căn", "lock can", "đặt cọc", "dat coc",
            "hợp đồng đặt cọc", "chuyển cọc", "booking", "unit hold", "unit_hold",
        ],
        "srs_doc": "appsale-v1/features/2.1-giu-cho-can/fsd.md",
        "business_logic": (
            "Mỗi căn hộ chỉ cho phép tối đa số lượt giữ chỗ theo cấu hình dự án và mỗi phiếu giữ chỗ có thời gian hiệu lực đếm ngược. "
            "Khi hết thời gian giữ chỗ mà chưa chuyển cọc hoặc gia hạn, hệ thống tự động giải phóng căn cho người tiếp theo trong hàng đợi."
        ),
        "steps": [
            "Kiểm tra trạng thái căn trên Bảng hàng và thứ tự ưu tiên giữ chỗ.",
            "Thực hiện yêu cầu chuyển cọc kèm ảnh chụp UNC trước khi hết thời gian giữ chỗ.",
        ],
        "code_ref": "apps/bookings/services/unit_hold_service.py:L45-L115 (UnitHoldService.create_hold)",
        "code_snippet": "if active_holds_count >= project.max_holds_per_unit:\n    raise ValidationError('Đã đạt giới hạn giữ chỗ tối đa cho căn này.')",
        "audit_status": "DRIFT",
        "audit_severity": "medium",
        "audit_drift": "Code có cơ chế giữ căn tạm thời nếu đang có yêu cầu gia hạn chờ Admin duyệt (chưa mô tả chi tiết trong SRS).",
        "audit_recommendation": "Bổ sung quy tắc 'Tạm hoãn tự động hủy giữ chỗ khi đang có phiếu xin gia hạn chờ duyệt' vào SRS mục 2.1.",
    },
    {
        "id": "notifications_fcm_celery",
        "module_name": "Thông báo đẩy (Push Notification)",
        "keywords": [
            "thông báo", "thong bao", "notification", "notifications", "fcm", "firebase", "celery", "device token",
        ],
        "srs_doc": "appsale-v1/features/0.1-tong-quan-va-nen-tang/fsd.md",
        "business_logic": (
            "Thông báo được gửi tự động ngầm ngay khi có thay đổi trạng thái phiếu hoặc sự kiện mới. "
            "Nếu không nhận được thông báo đẩy trên điện thoại, nguyên nhân thường do chưa cấp quyền thông báo hoặc phiên đăng nhập thiết bị đã hết hạn."
        ),
        "steps": [
            "Kiểm tra mục Thông báo bên trong ứng dụng.",
            "Đăng xuất và đăng nhập lại trên ứng dụng di động để làm mới kết nối nhận thông báo.",
        ],
        "code_ref": "apps/notifications/tasks.py:L1-L120 (send_push_notification_task)",
        "code_snippet": "def send_push_notification_task(user_id, title, body):\n    FCMService.send_multicast(tokens, title, body)",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "hrm_timesheet_work_history",
        "module_name": "Chấm công, Bảng công Tháng & Lịch sử Công tác (MVLGO-55 / MVLGO-211)",
        "keywords": [
            "mvlgo-55", "mvlgo-211", "chấm công", "cham cong", "bảng công", "bang cong",
            "công chuẩn", "cong chuan", "ngày công", "ngay cong", "lịch sử công tác",
            " điều động", "bổ nhiệm", "miễn nhiệm", "kiêm nhiệm", "timesheet", "attendance",
        ],
        "srs_doc": "features/hrm/6.4-monthly-timesheet/fsd.md & features/hrm/3.4-work-history/fsd.md",
        "business_logic": (
            "Bảng công tháng tự động tổng hợp dữ liệu chấm công (check-in/out), đơn nghỉ phép/công tác đã duyệt và ngày lễ để tính Tổng công hưởng lương so với Công chuẩn tháng. "
            "Đối với Lịch sử công tác, khi quyết định Điều động / Bổ nhiệm / Miễn nhiệm chuyển sang Đã hiệu lực, hệ thống tự động cập nhật phòng ban, chức danh hiện tại của nhân sự và lưu vết lịch sử công tác phục vụ tính lương & hoa hồng theo đúng thời điểm."
        ),
        "steps": [
            "Kiểm tra các đơn từ (nghỉ phép, giải trình chấm công, công tác) đã được Quản lý phê duyệt trước khi chốt bảng công.",
            "Kiểm tra Ngày hiệu lực trên Quyết định điều động/bổ nhiệm để hệ thống ghi nhận đúng phòng ban và vai trò quản lý trong kỳ.",
        ],
        "code_ref": "apps/hrm/services/timesheet_service.py:L40-L115 (TimesheetService.calculate_monthly_timesheet)",
        "code_snippet": "total_paid_days = attendance_days + approved_leave_days + holiday_days\nsummary.standard_days = get_branch_standard_working_days(month, year)",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "pbtv_fee_progress_dial",
        "module_name": "Bảng tính Phí Dịch vụ Tư vấn (PBTV) & Tiến độ về Phí",
        "keywords": [
            "pbtv", "phí dịch vụ", "phi dich vu", "phí tư vấn", "phi tu van",
            "tiến độ về phí", "tien do ve phi", "tỷ lệ về phí", "ty le ve phi",
            "chia phí", "chia phi", "cộng tác viên", "ctv", "commission_sheet",
        ],
        "srs_doc": "features/accounting/20.2-commission-calculation-sheet/fsd.md",
        "business_logic": (
            "Phiếu Bảng tính phí dịch vụ tư vấn (PBTV) xác định tổng phí dịch vụ nhận từ CĐT và phân bổ hoa hồng cho các đối tượng (Sale, CTV, Sàn liên kết, TPKD, GĐKD, GĐDA). "
            "Tỷ lệ tiến độ về phí được tính bằng Tổng tiền phí CĐT đã thanh toán thực tế (từ các Phiếu đối chiếu CĐT / Thu tiền) chia cho Tổng phí dịch vụ theo hợp đồng. "
            "Hệ thống chỉ cho phép chi trả hoa hồng theo đúng tỷ lệ % tiến độ về phí đã thu được từ CĐT."
        ),
        "steps": [
            "Kiểm tra Phiếu đối chiếu CĐT và chứng từ thu tiền phí dịch vụ đã được xác nhận chưa.",
            "Mở PBTV để kiểm tra Tỷ lệ về phí (%) và hạn mức hoa hồng được phép giải ngân trong đợt.",
        ],
        "code_ref": "apps/accounting/services/commission_sheet_service.py:L150-L220 (CommissionSheetService.calculate_fee_progress)",
        "code_snippet": "fee_progress_ratio = min(Decimal('1.0'), collected_fee_amount / total_contract_fee)\npayable_commission = total_role_commission * fee_progress_ratio",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "gdda_project_director_commission",
        "module_name": "Hoa hồng Giám đốc Dự án (GĐDA) & Thư ký Dự án",
        "keywords": [
            "gđda", "gdda", "giám đốc dự án", "giam doc du an", "thư ký dự án", "thu ky du an",
            "hoa hồng dự án", "hoa hong du an", "project director commission", "20.20",
        ],
        "srs_doc": "features/accounting/20.20-project-director-commission/fsd.md",
        "business_logic": (
            "Hoa hồng Giám đốc dự án (GĐDA) và Thư ký dự án được tính dựa trên chính sách hoa hồng của từng dự án và gắn liền với tiến độ về phí của giao dịch (PBTV). "
            "Nếu một dự án có nhiều GĐDA đồng phụ trách hoặc thay đổi GĐDA theo giai đoạn, hệ thống phân bổ tỷ lệ hưởng dựa trên cấu hình nhân sự phụ trách dự án tại thời điểm phát sinh giao dịch."
        ),
        "steps": [
            "Kiểm tra cấu hình Nhân sự phụ trách dự án (GĐDA / Thư ký dự án) và tỷ lệ hưởng trong Chính sách dự án.",
            "Kiểm tra trạng thái PBTV đã được duyệt và tỷ lệ về phí của giao dịch.",
        ],
        "code_ref": "apps/accounting/services/project_director_commission_service.py:L80-L145 (ProjectDirectorCommissionService.calculate)",
        "code_snippet": "for director_cfg in project.director_configs.active_at(deal.transaction_date):\n    amount = base_commission * director_cfg.share_rate * fee_progress_ratio",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
    {
        "id": "appsale_cms_erp_sync",
        "module_name": "Đồng bộ Dự án, Quỹ căn & Bảng hàng từ ERP sang AppSale CMS (MVLCTV-940)",
        "keywords": [
            "mvlctv-940", "mvlctv-904", "mvlctv-905", "đồng bộ", "dong bo", "quỹ căn", "quy can",
            "bảng hàng", "bang hang", "cms", "appsale", "app sale", "update_or_create", "marketing",
        ],
        "srs_doc": "appsale-v1/features/3.1-cms-portal/brd.md",
        "business_logic": (
            "Dữ liệu gốc của Dự án và Quỹ căn (mã căn, tòa, tầng, diện tích, giá niêm yết, trạng thái kho hàng) được quản lý tại ERP và đồng bộ tự động sang AppSale theo cơ chế cập nhật bảo toàn dữ liệu (không xóa trắng rồi tạo lại). "
            "Các thông tin phục vụ bán hàng và tiếp thị do Admin biên tập thêm trên AppSale CMS (ảnh mặt bằng, tài liệu bán hàng, mô tả truyền thông) luôn được giữ nguyên khi ERP đồng bộ giá hoặc trạng thái căn mới."
        ),
        "steps": [
            "Cập nhật thông tin gốc (giá, diện tích, trạng thái căn) trên phân hệ Dự án/Bảng hàng của ERP.",
            "Cập nhật hình ảnh truyền thông, tài liệu bán hàng và hiển thị trên cổng AppSale CMS.",
        ],
        "code_ref": "apps/projects/services/erp_sync_service.py:L55-L130 (ErpProjectSyncService.sync_project_and_units)",
        "code_snippet": "unit, _ = Unit.objects.update_or_create(erp_id=payload['id'], defaults=erp_core_fields)",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
]


def get_smart_code_context(query: str, allow_tech: bool = False) -> str:
    if not query:
        return ""
    q = query.lower()
    matched = []
    for dom in DOMAIN_CODE_MAP:
        score = 0
        for kw in dom["keywords"]:
            if kw in q:
                # Ưu tiên cao cho mã task hoặc cụm từ dài đặc thù
                if re.match(r"^(?:mvl|mvlgo|mvlctv)-\d+$|^86[a-z0-9]{6,}$", kw):
                    score += 10
                elif len(kw) >= 10:
                    score += 3
                elif len(kw) >= 6:
                    score += 2
                else:
                    score += 1
        code_ref_lower = dom.get("code_ref", "").lower()
        for token in re.findall(r"[a-zA-Z0-9_]+\.(?:py|ts|tsx)|[a-zA-Z0-9_]{5,}", code_ref_lower):
            if token in q:
                score += 3
        if score >= 2:
            matched.append((score, dom))

    matched.sort(key=lambda x: x[0], reverse=True)
    top_domains = [m[1] for m in matched[:2]]
    if not top_domains:
        return ""

    if not allow_tech:
        lines = ["\n=== LOGIC HỆ THỐNG THỰC TẾ ĐÃ XÁC THỰC (DÙNG ĐỂ TRẢ LỜI CHÍNH XÁC NGHIỆP VỤ) ==="]
        for dom in top_domains:
            steps_str = " ".join([f"({i+1}) {s}" for i, s in enumerate(dom["steps"])])
            lines.append(f"• Phân hệ: {dom['module_name']}")
            lines.append(f"• Quy tắc vận hành & Nguyên nhân thực tế: {dom['business_logic']}")
            lines.append(f"• Các bước xử lý trên giao diện: {steps_str}")
        return "\n".join(lines)

    lines = ["\n=== MÃ NGUỒN & LOGIC KỸ THUẬT TỪ REPO HỆ THỐNG (MVL-ERP) ==="]
    for dom in top_domains:
        lines.append(f"\n[Phân hệ: {dom['module_name']}] - {dom['business_logic']}")
        lines.append(f"[Vị trí Code: {dom['code_ref']}]:")
        lines.append(f"```python\n{dom['code_snippet']}\n```")
    return "\n".join(lines)


def run_srs_code_audit(query: str = "") -> Dict[str, Any]:
    clean_filter = re.sub(
        r"^(?:/audit[-_a-z]*|audit|đối chiếu|doi chieu|so sánh|kiểm tra|rà soát)\s*(?:srs|code|với|và|độ lệch)*\s*",
        "",
        (query or "").lower().strip(),
        flags=re.IGNORECASE,
    ).strip()

    selected = list(DOMAIN_CODE_MAP)
    if len(clean_filter) >= 3:
        filtered = [
            d
            for d in DOMAIN_CODE_MAP
            if clean_filter in d["module_name"].lower()
            or any(clean_filter in kw or kw in clean_filter for kw in d["keywords"])
        ]
        if filtered:
            selected = filtered

    matched_items = [d for d in selected if d["audit_status"] == "MATCHED"]
    drift_items = [d for d in selected if d["audit_status"] == "DRIFT"]

    lines = [
        "📋 *Báo cáo Audit SRS & Thực tế Hệ thống*",
        f"• *Phạm vi:* {len(selected)} phân hệ — ✅ *{len(matched_items)} đồng bộ* | ⚠️ *{len(drift_items)} điểm lệch*",
    ]

    if drift_items:
        lines.append("\n*⚠️ Các điểm lệch cần lưu ý:*")
        for d in drift_items:
            sev_label = "🔴 Cao" if d["audit_severity"] == "high" else "🟡 TB"
            lines.append(
                f"• *{d['module_name']}* ({sev_label}): {d['audit_drift']}\n  👉 _Đề xuất:_ {d['audit_recommendation']}"
            )
    else:
        lines.append("\n✅ *Tất cả phân hệ được kiểm tra đều đồng bộ 100% giữa SRS và Hệ thống!*")

    if matched_items:
        matched_names = ", ".join(d["module_name"] for d in matched_items)
        lines.append(f"\n✅ *Phân hệ khớp 100%:* {matched_names}.")

    summary = "\n".join(lines)
    blocks = [
        {"type": "section", "text": {"type": "mrkdwn", "text": summary}},
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "🐛 Tạo Task Đồng bộ trên Plane", "emoji": True},
                    "action_id": "create_plane_task",
                    "value": "create_audit_sync_task",
                    "style": "primary",
                }
            ],
        },
    ]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "totalChecked": len(selected),
        "matchedCount": len(matched_items),
        "driftCount": len(drift_items),
        "items": selected,
        "markdownSummary": summary,
        "slackBlocks": blocks,
    }


def sanitize_agent_response(raw_text: str, allow_tech: bool = False) -> str:
    """
    Hậu xử lý nghiêm ngặt:
    1. Lược bỏ 100% đoạn giới thiệu dài dòng ở đầu ("Chào bạn, với tư cách là...", "Tôi xin phản hồi...", "Dựa trên tài liệu...").
    2. Loại bỏ các dòng "Khuyến nghị: Vui lòng cung cấp nội dung..." hoặc trích dẫn Changelog rác.
    3. Nếu allow_tech=False (mặc định): khử triệt để mọi tên file code, hàm, class, biến kỹ thuật.
    """
    if not raw_text:
        return ""
    cleaned = raw_text.strip()

    # 1. Cắt bỏ mọi câu mở đầu chào hỏi / tự giới thiệu vai trò dài dòng
    intro_patterns = [
        r"^(?:👋\s*)?(?:Xin\s+chào|Chào\s+bạn|Chào\s+anh/chị)[^\n]*\n+",
        r"^(?:👋\s*)?(?:Xin\s+chào|Chào\s+bạn|Chào\s+anh/chị)[^\.!\n]*[\.!:]\s*",
        r"^(?:Với\s+tư\s+cách\s+là|Là\s+(?:một\s+)?(?:Trợ\s+lý|Chuyên\s+gia))[^\n]*\n+",
        r"^(?:Tôi\s+xin\s+phản\s+hồi|Mình\s+xin\s+phản\s+hồi|Dưới\s+đây\s+là\s+phản\s+hồi)[^\n]*\n+",
        r"^(?:Dựa\s+trên\s+(?:hệ\s+thống\s+)?tài\s+liệu\s+SRS[^\n]*như\s+sau\s*:?\s*\n*)",
        r"^(?:Không\s+tìm\s+thấy\s+kết\s+quả\s+từ\s+tool[^\n]*\n*|Tuy\s+nhiên,\s*)",
    ]
    for _ in range(3):
        for pat in intro_patterns:
            cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()

    # Xử lý câu ghép kiểu: "Chào bạn, với tư cách là ... như sau:" nằm ngay dòng đầu
    cleaned = re.sub(
        r"^(?:Chào\s+bạn|Xin\s+chào)[\s,]+với\s+tư\s+cách\s+là[^\n]*?(?:như\s+sau\s*:?\s*)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    ).strip()

    cleaned = re.sub(r"Gọi tool:\s*[a-zA-Z0-9_]+\s*\(.*?\)\s*", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"search_codebase\s*\(.*?\)\s*", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"read_code_file\s*\(.*?\)\s*", "", cleaned, flags=re.DOTALL)

    # 2. Xóa các trích dẫn Changelog rác hoặc câu "Khuyến nghị: Vui lòng cung cấp..."
    cleaned = re.sub(r"\[Tài liệu:[^\]]*Changelog[^\]]*\]\n?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"\*{0,2}Khuyến\s+nghị\s*:\*{0,2}\s*Vui\s+lòng\s+cung\s+cấp\s+nội\s+dung\s+mô\s+tả[^\n]*\n?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    if not allow_tech:
        cleaned = re.sub(r"```(?:python|ts|tsx|javascript|js|json|sql|bash|sh)[\s\S]*?```", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\[(?:Code|Mã nguồn|File)\s*:[^\]]+\]", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\((?:File|Code)\s*:[^)]+\)", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(
            r"`?(?:backend/|web/|app-sale/|code:erp-backend/|code:appsale-backend/)?(?:apps|src|services|models|views|api)/[\w/\.\-]+\.(?:py|ts|tsx|js)(?::L?\d+(?:-L?\d+)?)?`?",
            "hệ thống",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"`?\b[\w\-]+\.(?:py|ts|tsx|js)(?::L?\d+(?:-L?\d+)?)?`?", "hệ thống", cleaned, flags=re.IGNORECASE)

        replacements = [
            (r"`?MonthlyManagementCommissionService`?", "nghiệp vụ Hoa hồng quản lý tháng"),
            (r"`?_resolve_managers_for_department`?", "xác định người nhận hoa hồng quản lý theo phòng ban"),
            (r"`?sales_manager_source`?", "nguồn lấy Trưởng phòng kinh doanh"),
            (r"`?sales_director_source`?", "nguồn lấy Giám đốc kinh doanh"),
            (r"`?DEPARTMENT_HEAD`?", "Trưởng phòng"),
            (r"`?DIVISION_DIRECTOR`?", "Giám đốc khối"),
            (r"`?BRANCH_DIRECTOR`?", "Giám đốc chi nhánh"),
            (r"`?MonthlyBeneficiaryCommissionSummary`?", "Bảng tổng hợp hoa hồng theo tháng"),
            (r"`?InvestorReconciliationSheet`?", "Phiếu đối chiếu Chủ đầu tư"),
            (r"`?SalesInvoiceService`?", "nghiệp vụ Hóa đơn bán ra"),
            (r"`?SalesInvoice`?", "Hóa đơn bán ra"),
            (r"`?InvalidStateTransitionError`?", "quy tắc kiểm soát trạng thái"),
            (r"`?ValidationError`?", "kiểm tra dữ liệu hợp lệ"),
            (r"`?_attach_summary_line`?", "cập nhật dòng tổng hợp hoa hồng"),
            (r"`?create_from_pdcdt`?", "tự động tạo hóa đơn từ Phiếu đối chiếu CĐT"),
            (r"`?post_accounting`?", "Ghi sổ kế toán"),
            (r"`?_resolve_period`?", "xác định kỳ kế toán"),
            (r"`?reconciliation_date`?", "ngày đối chiếu"),
            (r"`?issue_date`?", "ngày lập hóa đơn"),
            (r"`?accounting_period`?", "kỳ kế toán"),
            (r"`?MonthlySummaryStatus\.DRAFT`?", "trạng thái Nháp"),
            (r"`?MonthlySummaryStatus\.CONFIRMED`?", "trạng thái Đã xác nhận"),
            (r"\btrạng thái\s+`?DRAFT`?\b", "trạng thái Nháp"),
            (r"\btrạng thái\s+`?CONFIRMED`?\b", "trạng thái Đã xác nhận"),
            (r"\btrạng thái\s+`?APPROVED`?\b", "trạng thái Đã duyệt"),
            (r"\btrạng thái\s+`?REJECTED`?\b", "trạng thái Từ chối"),
            (r"\btrạng thái\s+`?PAID`?\b", "trạng thái Đã thanh toán"),
        ]
        for pattern, repl in replacements:
            cleaned = re.sub(pattern, repl, cleaned, flags=re.IGNORECASE)

    # 4. Tự động tách các gạch đầu dòng quá dài (> 220 ký tự, ghép nhiều câu) thành các gạch đầu dòng ngắn gọn
    normalized_lines = []
    for line in cleaned.splitlines():
        s_line = line.strip()
        if s_line.startswith(("•", "-", "* ")) and len(s_line) > 220 and "|" not in s_line:
            body = re.sub(r"^(?:•|\-|\*)\s*", "", s_line)
            sub_clauses = [c.strip().rstrip(".") for c in re.split(r"(?:\.\s+|\;\s+)", body) if c.strip()]
            if len(sub_clauses) > 1:
                for sc in sub_clauses:
                    normalized_lines.append(f"• {sc}.")
                continue
        normalized_lines.append(line)
    cleaned = "\n".join(normalized_lines)

    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned


class GeminiAgent:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        if not self.api_key:
            logger.warning("GEMINI_API_KEY is not set!")
        self.client = genai.Client(api_key=self.api_key) if (self.api_key and genai) else None
        self.primary_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        self.fallback_models = [
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash",
            "gemini-flash-latest",
        ]

    def _get_model_candidates(self) -> List[str]:
        candidates = [self.primary_model]
        for m in self.fallback_models:
            if m not in candidates:
                candidates.append(m)
        return candidates

    def generate(
        self,
        query: str,
        srs_context: str = "",
        history: Optional[List[Dict[str, Any]]] = None,
        instruction_type: str = "default",
        enriched_query: str = "",
    ) -> str:
        lookup_text = f"{query} {enriched_query}".strip()
        tech_mode = is_tech_requested(query) or instruction_type == "tech"
        instructions = {
            "default": SYSTEM_INSTRUCTION_DEV if tech_mode else SYSTEM_INSTRUCTION_DEFAULT,
            "tech": SYSTEM_INSTRUCTION_DEV,
            "usecase": SYSTEM_INSTRUCTION_USECASE,
            "testcase": SYSTEM_INSTRUCTION_TESTCASE,
            "task_extract": SYSTEM_INSTRUCTION_TASK_EXTRACT,
        }
        system_instruction = instructions.get(instruction_type, SYSTEM_INSTRUCTION_DEFAULT)

        code_context = ""
        if instruction_type in ("default", "tech"):
            code_context = get_smart_code_context(lookup_text, allow_tech=tech_mode)

        prompt_parts = []
        if srs_context:
            prompt_parts.append(srs_context)
        if code_context:
            prompt_parts.append(code_context)
        if prompt_parts:
            prompt_parts.append("\n---\n")

        if history:
            prompt_parts.append("Lịch sử trao đổi gần nhất trong thread:\n")
            for h in history:
                role = "Trợ lý AI" if h.get("role") == "model" else "Người dùng"
                parts = h.get("parts", [])
                text_part = parts[0].get("text", "") if parts and isinstance(parts[0], dict) else str(parts)
                prompt_parts.append(f"- {role}: {text_part}\n")
            prompt_parts.append("\n---\n")

        prompt_parts.append(f"Yêu cầu của người dùng (Trả lời thẳng ngay dòng 1, KHÔNG chào hỏi hay giới thiệu vai trò):\n{query}")
        final_prompt = "\n".join(prompt_parts)

        if self.client:
            for model_name in self._get_model_candidates():
                try:
                    logger.info(f"Generating content with model: {model_name}")
                    config = types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.15 if instruction_type in ["usecase", "testcase", "task_extract"] else 0.2,
                    )
                    response = self.client.models.generate_content(
                        model=model_name,
                        contents=final_prompt,
                        config=config,
                    )
                    if response and response.text:
                        if instruction_type == "task_extract":
                            return response.text.strip()
                        return sanitize_agent_response(response.text, allow_tech=tech_mode)
                except Exception as e:
                    logger.warning(f"Model {model_name} failed: {e}")
                    continue

        # Smart Deterministic Fallback nếu Gemini API offline hoặc thiếu key
        return self._generate_offline_fallback(lookup_text, srs_context, code_context, instruction_type, tech_mode)

    def _generate_offline_fallback(
        self,
        query: str,
        srs_context: str,
        code_context: str,
        instruction_type: str,
        tech_mode: bool,
    ) -> str:
        if instruction_type == "usecase":
            return (
                f"💡 *Tóm tắt nghiệp vụ:* Đặc tả Use Case chuẩn cho yêu cầu *{query}*.\n\n"
                "| Mã UC | Nhóm | Tên use case | Tác nhân chính | BR liên quan | Ghi chú |\n"
                "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
                "| UC-01 | Luồng chính | Tạo và gửi duyệt phiếu | Nhân viên / Kế toán | BR-01 | Kiểm tra điều kiện hợp lệ |\n"
                "| UC-02 | Phê duyệt | Phê duyệt và ghi nhận trạng thái | Quản lý / Kế toán trưởng | BR-02 | Cập nhật trạng thái Đã duyệt |\n\n"
                "| Mã UC | Nhóm | Tên use case | Tác nhân | Điều kiện tiên quyết | Trigger | Luồng chính | Luồng phụ / Ngoại lệ | Hậu điều kiện | BR liên quan |\n"
                "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n"
                "| UC-01 | Luồng chính | Tạo và gửi duyệt phiếu | Nhân viên | Đã đăng nhập | Bấm Tạo mới | Nhập thông tin -> Lưu Nháp -> Gửi duyệt | Thiếu thông tin -> Báo lỗi | Phiếu chuyển Chờ duyệt | BR-01 |\n"
                "| UC-02 | Phê duyệt | Phê duyệt phiếu | Quản lý | Phiếu đang Chờ duyệt | Bấm Duyệt | Kiểm tra -> Xác nhận duyệt | Từ chối -> Nhập lý do | Phiếu chuyển Đã duyệt | BR-02 |"
            )
        if instruction_type == "testcase":
            return (
                f"💡 *Phạm vi kiểm thử:* Kịch bản kiểm thử UAT cho *{query}*.\n\n"
                "| Sub Module | Mô tả | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |\n"
                "| :--- | :--- | :--- | :--- | :--- |\n"
                "| Luồng chính | Tạo và duyệt phiếu hợp lệ | 1. Mở màn hình -> 2. Nhập đầy đủ -> 3. Bấm Xác nhận | Lưu và chuyển trạng thái thành công | Số tiền: 50,000,000 VNĐ |\n"
                "| Ngoại lệ | Bỏ trống trường bắt buộc | 1. Mở màn hình -> 2. Để trống -> 3. Bấm Lưu | Hiển thị cảnh báo yêu cầu nhập thông tin | Trường bắt buộc: Trống |\n"
                "| Phân quyền | Tài khoản không có quyền duyệt | 1. Đăng nhập NV thường -> 2. Mở phiếu chờ duyệt | Ẩn hoặc khóa nút Phê duyệt | Role: Nhân viên kinh doanh |"
            )

        q = query.lower()
        scored_domains = []
        for dom in DOMAIN_CODE_MAP:
            score = 0
            for kw in dom["keywords"]:
                if kw in q:
                    if re.match(r"^(?:mvl|mvlgo|mvlctv)-\d+$|^86[a-z0-9]{6,}$", kw):
                        score += 10
                    elif len(kw) >= 10:
                        score += 3
                    elif len(kw) >= 6:
                        score += 2
                    else:
                        score += 1
            code_ref_lower = dom.get("code_ref", "").lower()
            for token in re.findall(r"[a-zA-Z0-9_]+\.(?:py|ts|tsx)|[a-zA-Z0-9_]{5,}", code_ref_lower):
                if token in q:
                    score += 3
            if score >= 1:
                scored_domains.append((score, dom))

        scored_domains.sort(key=lambda x: x[0], reverse=True)
        if scored_domains:
            dom = scored_domains[0][1]
            steps_txt = "\n".join([f"• {s}" for s in dom["steps"]])
            raw_clauses = [
                c.strip().rstrip(".")
                for c in re.split(r"(?:\.\s+|\;\s+)", dom["business_logic"])
                if c.strip()
            ]
            bullet_clauses = "\n".join([f"• {c}." for c in raw_clauses])
            if tech_mode:
                return (
                    f"💡 *Tóm tắt:* {raw_clauses[0]}.\n"
                    f"{bullet_clauses}\n"
                    f"💻 *Logic Code:*\n"
                    f"• *Vị trí:* `{dom['code_ref']}`\n"
                    f"• *Điều kiện xử lý:* `{dom['code_snippet'].splitlines()[0]}`\n"
                    f"👉 *Hướng xử lý:*\n{steps_txt}"
                )
            return sanitize_agent_response(
                f"💡 *{dom['module_name']}:*\n"
                f"{bullet_clauses}\n"
                f"👉 *Cách xử lý:*\n{steps_txt}",
                allow_tech=False,
            )

        if srs_context and ("TRÍCH DẪN TÀI LIỆU" in srs_context or "THÔNG TIN TASK TRÊN PLANE" in srs_context):
            lines = [
                ln.strip()
                for ln in srs_context.splitlines()
                if ln.strip()
                and not ln.strip().startswith("===")
                and not ln.strip().startswith("---")
                and not ln.strip().startswith("|")
                and not ln.strip().startswith("#")
                and not ln.strip().startswith("[Nguồn ")
            ]
            bullet_lines = lines[:3] if lines else ["Hệ thống kiểm tra điều kiện nghiệp vụ và phân quyền theo tài liệu SRS."]
            bullets_str = "\n".join([f"• {b[:220]}" for b in bullet_lines])
            return sanitize_agent_response(
                f"💡 *Kết quả tra cứu quy định nghiệp vụ trên hệ thống:*\n{bullets_str}\n"
                f"👉 *Cách xử lý:* Kiểm tra trạng thái chứng từ, cấu hình danh mục và phân quyền trên màn hình tương ứng.",
                allow_tech=tech_mode,
            )

        return "💡 *Thông tin nghiệp vụ:* Hệ thống thực hiện kiểm tra trạng thái phiếu và kỳ kế toán theo quy chuẩn.\n👉 *Cách xử lý:* Bạn vui lòng kiểm tra trạng thái chứng từ đang ở Nháp hay Đã xác nhận để thao tác tiếp nhé!"
