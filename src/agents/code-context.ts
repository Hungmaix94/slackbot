import { GitHubClient } from "../github/client";
import { isTechRequested } from "./router";

export interface PreloadedCodeSnippet {
  repo: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  functionOrClass?: string;
  description: string;
  codePreview?: string;
}

export interface DomainLogicEntry {
  id: string;
  moduleName: string;
  keywords: string[];
  srsDocPath: string;
  srsRuleSummary: string;
  businessLogicSummary: string;
  actionableSteps: string[];
  snippets: PreloadedCodeSnippet[];
}

/**
 * Bản đồ Tri thức Lai (SRS + Code Ground-Truth) cho các phân hệ cốt lõi của MaiVietLand
 */
export const DOMAIN_CODE_MAP: DomainLogicEntry[] = [
  {
    id: "hhql_branch_config_mvl_3819",
    moduleName: "Hoa hồng Quản lý (HHQL) Tháng & Cấu hình Nguồn Quản lý Chi nhánh (MVL-3819)",
    keywords: [
      "mvl-3819", "3819", "86exztban", "hhql", "hoa hồng quản lý", "hoa hong quan ly",
      "hải phòng", "hai phong", "chi nhánh", "chi nhanh", "cách tính khác",
      "nguồn quản lý", "nguon quan ly", "giám đốc khối", "giam doc khoi", "giám đốc chi nhánh",
      "sales_manager_source", "sales_director_source", "_resolve_managers_for_department",
      "management_commission_service.py", "20.19", "kpi phòng", "kpi phong"
    ],
    srsDocPath: "features/accounting/20.19-monthly-management-commission-from-dept-kpi/fsd.md",
    srsRuleSummary: "HHQL tháng tính theo % hoàn thành KPI phòng (= Doanh thu phòng / Chỉ tiêu phòng × 100) và xác định người nhận TPKD/GĐKD theo cấu hình nguồn quản lý kinh doanh của Chi nhánh (Standard / Flat / Hybrid).",
    businessLogicSummary:
      "Công thức tính Hoa hồng quản lý (HHQL) tháng của Hải Phòng KHÔNG khác các chi nhánh còn lại — toàn hệ thống dùng chung công thức: tính % hoàn thành KPI phòng (= Doanh thu ghi nhận của phòng / Chỉ tiêu phòng × 100), tra bảng 4 bậc để nhân tỷ lệ % cho 4 vai trò (TPKD, GĐKD, TGĐ, TP TKKD). Tuy nhiên, người nhận hoa hồng của vai TPKD và GĐKD phụ thuộc vào Cấu hình nguồn quản lý kinh doanh trên từng Chi nhánh (gồm 3 mô hình: Chuẩn/Standard: TPKD lấy Trưởng phòng, GĐKD lấy Giám đốc khối; Phẳng/Flat: TPKD lấy Trưởng phòng, GĐKD lấy Giám đốc chi nhánh; Lai/Hybrid: TPKD lấy Giám đốc khối, GĐKD lấy Giám đốc chi nhánh). Nguyên nhân thực tế khiến Hải Phòng ra số liệu khác: (1) Hải Phòng đang để cấu hình mặc định Chuẩn (GĐKD = Giám đốc khối) nhưng các Khối kinh doanh tại Hải Phòng đang bỏ trống trường Giám đốc khối, khiến phần HHQL của vai GĐKD bị bỏ qua không sinh dòng chi (~10,8 triệu); (2) Dữ liệu danh mục đang tách làm 2 chi nhánh độc lập là Hải phòng (CN000000006) và Hải Phòng 2 (CN000000010), gây lệch khi cộng gộp đối chiếu.",
    actionableSteps: [
      "Vào Danh mục Chi nhánh kiểm tra trường 'Cấu hình nguồn quản lý kinh doanh' của Hải Phòng: nếu chi nhánh không bổ nhiệm Giám đốc khối riêng mà Giám đốc chi nhánh kiêm nhiệm, chuyển cấu hình sang mô hình Phẳng (Flat) hoặc Lai (Hybrid).",
      "Hoặc vào Sơ đồ tổ chức (Cơ cấu Khối/Phòng) cập nhật đầy đủ nhân sự giữ vai trò Giám đốc khối cho các khối thuộc chi nhánh Hải Phòng.",
      "Kiểm tra phạm vi lọc chi nhánh khi đối chiếu số liệu vì Hải Phòng đang tách thành 2 mã chi nhánh: CN000000006 (Hải phòng) và CN000000010 (Hải Phòng 2), sau đó bấm Tính toán lại trên kỳ HHQL tháng."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/management_commission_service.py",
        startLine: 228,
        endLine: 295,
        functionOrClass: "MonthlyManagementCommissionService._resolve_managers_for_department",
        description: "Hàm _resolve_managers_for_department ánh xạ người nhận TPKD và GĐKD theo cấu hình sales_manager_source và sales_director_source của Branch",
        codePreview: `def _resolve_managers_for_department(department) -> dict[str, Employee | None]:\n    branch = department.branch\n    sm_source = getattr(branch, 'sales_manager_source', SalesManagerSource.DEPARTMENT_HEAD)\n    sd_source = getattr(branch, 'sales_director_source', SalesDirectorSource.DIVISION_DIRECTOR)\n    tpkd = department.manager if sm_source == SalesManagerSource.DEPARTMENT_HEAD else (department.division.director if department.division else None)\n    gdkd = (department.division.director if department.division else None) if sd_source == SalesDirectorSource.DIVISION_DIRECTOR else (branch.director if branch else None)\n    return {'TPKD': tpkd, 'GDKD': gdkd}`,
      },
    ],
  },
  {
    id: "pdcdt_sales_invoice_period",
    moduleName: "Đối chiếu CĐT & Hóa đơn bán ra",
    keywords: [
      "đối chiếu", "doi chieu", "cđt", "cdt", "hóa đơn", "hoa don",
      "bán ra", "ban ra", "kỳ hoa hồng", "ky hoa hong", "nhảy kỳ", "lệch kỳ",
      "pdcdt", "irs", "sales_invoice", "salesinvoice", "investorreconciliationsheet", "create_from_pdcdt"
    ],
    srsDocPath: "features/accounting/20.6-sales-invoice-management/fsd.md",
    srsRuleSummary: "Khi Phiếu đối chiếu CĐT (PDCDT) chuyển sang Đã xác nhận, hệ thống tự động sinh Hóa đơn bán ra và gán vào kỳ kế toán tương ứng.",
    businessLogicSummary:
      "Khi Phiếu đối chiếu Chủ đầu tư (PDCDT) được duyệt sang trạng thái Đã xác nhận, hệ thống tự động tạo Hóa đơn bán ra. Kỳ kế toán (kỳ hoa hồng) của Hóa đơn bán ra được xác định ưu tiên theo Ngày đối chiếu trên Phiếu đối chiếu CĐT (chứ không lấy theo ngày bấm duyệt hiện tại). Nếu ngày đối chiếu rơi vào tháng trước (hoặc kỳ tháng hiện tại chưa mở nên hệ thống lấy kỳ đang mở gần nhất), hóa đơn sẽ được ghi nhận vào kỳ tháng trước đó.",
    actionableSteps: [
      "Kiểm tra lại trường Ngày đối chiếu trên Phiếu đối chiếu CĐT xem đang để ngày thuộc tháng nào.",
      "Kiểm tra danh sách Kỳ kế toán xem kỳ tháng mới đã được khởi tạo và mở chưa.",
      "Nếu cần chuyển kỳ, mở lại phiếu hoặc điều chỉnh kỳ kế toán trên Hóa đơn bán ra khi còn ở trạng thái Nháp."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/sales_invoice_service.py",
        startLine: 20,
        endLine: 45,
        functionOrClass: "SalesInvoiceService._resolve_period",
        description: "Logic xác định kỳ kế toán (_resolve_period) ưu tiên từ ngày đối chiếu (reconciliation_date) và fallback về kỳ đang mở gần nhất",
        codePreview: `def _resolve_period(target_date):\n    period = AccountingPeriod.objects.filter(start_date__lte=target_date, end_date__gte=target_date).first()\n    if not period:\n        period = AccountingPeriod.objects.filter(status=PeriodStatus.OPEN).order_by('-start_date').first()\n    return period`,
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/sales_invoice_service.py",
        startLine: 219,
        endLine: 277,
        functionOrClass: "SalesInvoiceService.create_from_pdcdt",
        description: "Hàm create_from_pdcdt khởi tạo Hóa đơn bán ra từ Phiếu đối chiếu CĐT",
        codePreview: `def create_from_pdcdt(cls, pdcdt: InvestorReconciliationSheet):\n    target_date = pdcdt.reconciliation_date or timezone.now().date()\n    period = cls._resolve_period(target_date)\n    return SalesInvoice.objects.create(reconciliation_sheet=pdcdt, accounting_period=period, status=InvoiceStatus.DRAFT)`,
      },
      {
        repo: "backend",
        filePath: "apps/accounting/signals.py",
        startLine: 350,
        endLine: 376,
        functionOrClass: "auto_create_sales_invoice_on_pdcdt_confirmed",
        description: "Signal tự động sinh SalesInvoice khi InvestorReconciliationSheet chuyển sang CONFIRMED",
      },
    ],
  },
  {
    id: "linked_exchange_monthly_summary",
    moduleName: "Hoa hồng Sàn liên kết & Bảng tổng hợp tháng",
    keywords: [
      "sàn liên kết", "san lien ket", "hoa hồng theo tháng", "hoa hong theo thang",
      "ghi sổ", "ghi so", "bảng tổng hợp", "bang tong hop", "bảng kê", "bang ke",
      "linked-exchange", "linked_exchange", "monthly summary", "employee summary",
      "draft", "nháp", "beneficiary", "beneficiary_employee", "post_accounting",
      "_attach_summary_line", "must be draft"
    ],
    srsDocPath: "features/accounting/linked-exchange-dept-commission/fsd.md",
    srsRuleSummary: "Ghi sổ hoa hồng sàn liên kết sẽ tự động cập nhật dữ liệu vào Bảng tổng hợp hoa hồng tháng của nhân viên thụ hưởng.",
    businessLogicSummary:
      "Khi thực hiện Ghi sổ hoa hồng Sàn liên kết, hệ thống sẽ tự động đẩy dòng hoa hồng này vào Bảng tổng hợp hoa hồng theo tháng của nhân viên phụ trách. Để đảm bảo số liệu đã chốt không bị thay đổi ngầm, hệ thống bắt buộc Bảng tổng hợp hoa hồng tháng của nhân viên đó phải đang ở trạng thái Nháp. Nếu bảng tổng hợp của nhân viên đã được Xác nhận/Chốt trước đó, hệ thống sẽ chặn thao tác ghi sổ.",
    actionableSteps: [
      "Vào màn hình Bảng tổng hợp hoa hồng theo tháng của nhân viên thụ hưởng trong kỳ tương ứng.",
      "Bấm nút Mở lại (đưa bảng tổng hợp từ Đã xác nhận về trạng thái Nháp).",
      "Quay lại màn hình Hoa hồng sàn liên kết thực hiện Ghi sổ, sau đó xác nhận lại Bảng tổng hợp."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/linked_exchange_dept_commission_service.py",
        startLine: 742,
        endLine: 760,
        functionOrClass: "LinkedExchangeDeptCommissionService._attach_summary_line",
        description: "Hàm _attach_summary_line kiểm tra trạng thái DRAFT của MonthlyBeneficiaryCommissionSummary trước khi đính kèm dòng hoa hồng sàn liên kết",
        codePreview: `if summary.status != MonthlySummaryStatus.DRAFT:\n    raise InvalidStateTransitionError("Employee monthly summary must be DRAFT to attach linked exchange commission line.")`,
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/linked_exchange_dept_commission_service.py",
        startLine: 920,
        endLine: 953,
        functionOrClass: "LinkedExchangeDeptCommissionService.post_accounting",
        description: "Hàm post_accounting thực hiện Ghi sổ Hoa hồng Sàn liên kết và gọi _attach_summary_line",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/monthly_summary_service.py",
        startLine: 1405,
        endLine: 1445,
        functionOrClass: "MonthlySummaryService.reopen",
        description: "Hàm reopen mở lại Bảng tổng hợp hoa hồng từ CONFIRMED về DRAFT",
      },
    ],
  },
  {
    id: "commission_advance_repayment",
    moduleName: "Tạm ứng & Hoàn ứng Hoa hồng",
    keywords: [
      "tạm ứng", "tam ung", "thu hồi", "thu hoi", "hoàn ứng", "hoan ung",
      "khấu trừ", "khau tru", "dư nợ", "du no",
      "commission advance", "advance repayment", "advance_recovery"
    ],
    srsDocPath: "features/accounting/20.17-commission-advance-management/fsd.md",
    srsRuleSummary: "Nhân viên có thể tạo phiếu tạm ứng hoa hồng theo hạn mức. Khi tính hoa hồng tháng, hệ thống khấu trừ tự động dư nợ tạm ứng đã chi (PAID).",
    businessLogicSummary:
      "Phiếu tạm ứng hoa hồng cần đi qua các bước: Nháp -> Chờ duyệt -> Đã duyệt -> Đã chi tiền. Khi lập Bảng tổng hợp hoa hồng tháng, hệ thống chỉ tự động khấu trừ đối với các khoản tạm ứng đã ở trạng thái Đã chi tiền và còn dư nợ. Nếu số hoa hồng thực nhận trong kỳ nhỏ hơn dư nợ tạm ứng, phần chênh lệch còn lại sẽ tự động chuyển sang kỳ tiếp theo để khấu trừ tiếp.",
    actionableSteps: [
      "Kiểm tra trạng thái Phiếu tạm ứng đã chuyển sang Đã chi tiền (Paid) chưa.",
      "Tại Bảng tổng hợp hoa hồng tháng, kiểm tra cột Khấu trừ tạm ứng và Dư nợ chuyển kỳ sau."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_advance_service.py",
        startLine: 1,
        endLine: 65,
        functionOrClass: "CommissionAdvanceService.validate_advance_limit",
        description: "Kiểm tra hạn mức tạm ứng và vòng đời phê duyệt phiếu tạm ứng",
        codePreview: `if advance.amount > max_allowed_advance:\n    raise ValidationError("Số tiền tạm ứng vượt quá hạn mức cho phép của giao dịch.")`,
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_advance_repayment_service.py",
        startLine: 240,
        endLine: 275,
        functionOrClass: "CommissionAdvanceRepaymentService.deduct_from_monthly_summary",
        description: "Hàm khấu trừ tự động dư nợ tạm ứng (trạng thái PAID) trên Bảng tổng hợp hoa hồng tháng",
      },
    ],
  },
  {
    id: "commission_hold",
    moduleName: "Tạm giữ Hoa hồng",
    keywords: [
      "tạm giữ", "tam giu", "giữ hoa hồng", "giu hoa hong", "giải tỏa", "giai toa",
      "commission hold", "commission_hold"
    ],
    srsDocPath: "features/accounting/20.15-commission-hold-management/fsd.md",
    srsRuleSummary: "Cho phép tạm giữ một phần hoặc toàn bộ hoa hồng của nhân viên theo tỷ lệ/số tiền và giải tỏa khi đủ điều kiện.",
    businessLogicSummary:
      "Khoản tạm giữ hoa hồng chỉ được áp dụng hoặc chỉnh sửa khi Bảng tổng hợp hoa hồng tháng của nhân viên chưa bị khóa sổ (đang ở trạng thái Nháp). Khi đủ điều kiện hồ sơ, kế toán thực hiện Giải tỏa tạm giữ để cộng trả số tiền này vào đợt chi trả hoa hồng tiếp theo.",
    actionableSteps: [
      "Mở màn hình Quản lý tạm giữ hoa hồng, chọn phiếu cần xử lý.",
      "Nếu cần giải tỏa, bấm Giải tỏa tạm giữ và chọn kỳ hạch toán hoàn trả."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_hold_service.py",
        startLine: 825,
        endLine: 865,
        functionOrClass: "CommissionHoldService.apply_hold",
        description: "Logic áp dụng và giải tỏa tạm giữ hoa hồng trên bảng tổng hợp nhân viên",
      },
    ],
  },
  {
    id: "payout_wave_and_batch",
    moduleName: "Đợt chi & Lệnh chi Hoa hồng",
    keywords: [
      "đợt chi", "dot chi", "payout wave", "payout batch", "lệnh chi", "lenh chi",
      "chi trả hoa hồng", "chi tra hoa hong", "thanh toán hoa hồng"
    ],
    srsDocPath: "features/accounting/20.18-employee-commission-payout-batch/fsd.md",
    srsRuleSummary: "Sau khi Bảng tổng hợp hoa hồng tháng được xác nhận, kế toán tạo Đợt chi (Payout Wave) và Lệnh chi (Payout Batch) để giải ngân.",
    businessLogicSummary:
      "Hệ thống chỉ cho phép đưa các dòng hoa hồng từ Bảng tổng hợp tháng đã ở trạng thái Đã xác nhận vào Đợt chi / Lệnh chi. Tổng số tiền tạo lệnh chi không được vượt quá Số tiền còn lại phải trả (sau khi đã trừ thuế TNCN, tạm giữ và khấu trừ tạm ứng).",
    actionableSteps: [
      "Đảm bảo Bảng tổng hợp hoa hồng tháng đã được bấm Xác nhận.",
      "Tạo Đợt chi -> Chọn danh sách nhân viên đủ điều kiện -> Xuất Lệnh chi ngân hàng."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/payout_wave_service.py",
        startLine: 110,
        endLine: 160,
        functionOrClass: "PayoutWaveService.create_wave",
        description: "Dịch vụ khởi tạo và kiểm tra điều kiện các đợt chi (payout wave)",
      },
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_payout_batch_service.py",
        startLine: 125,
        endLine: 170,
        functionOrClass: "CommissionPayoutBatchService.validate_batch_items",
        description: "Kiểm tra trạng thái CONFIRMED và số dư khả dụng trước khi sinh Lệnh chi",
      },
    ],
  },
  {
    id: "accounting_period_lifecycle",
    moduleName: "Kỳ kế toán (Đóng / Mở kỳ)",
    keywords: [
      "kỳ kế toán", "ky ke toan", "đóng kỳ", "dong ky", "mở kỳ", "mo ky",
      "khóa sổ", "khoa so", "soft close", "hard close", "accounting_period"
    ],
    srsDocPath: "features/accounting/accounting_end_to_end_flow.md",
    srsRuleSummary: "Kỳ kế toán hỗ trợ 3 trạng thái: Mở (OPEN), Đóng mềm (SOFT_CLOSED - chỉ Kế toán trưởng được điều chỉnh) và Đóng cứng (HARD_CLOSED - khóa hoàn toàn).",
    businessLogicSummary:
      "Kỳ kế toán có 3 mức kiểm soát: Đang mở (cho phép hạch toán bình thường), Đóng mềm (chặn nhân viên thường tạo/sửa phiếu, chỉ người có quyền Kế toán trưởng mới được phép ghi nhận điều chỉnh hoặc mở lại kỳ), và Đóng cứng (khóa sổ hoàn toàn, không ai được sửa đổi số liệu trong kỳ đó).",
    actionableSteps: [
      "Nếu kỳ đang Đóng mềm và cần bổ sung chứng từ, nhờ Kế toán trưởng thực hiện Mở lại kỳ về trạng thái Đang mở.",
      "Sau khi hoàn tất điều chỉnh, thực hiện Đóng kỳ lại để bảo vệ số liệu."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/accounting_period_service.py",
        startLine: 135,
        endLine: 180,
        functionOrClass: "AccountingPeriodService.transition_state",
        description: "Quản lý vòng đời kỳ kế toán: OPEN -> SOFT_CLOSED -> HARD_CLOSED và reopen",
      },
    ],
  },
  {
    id: "booking_unit_hold_deposit",
    moduleName: "Giữ chỗ (Booking) & Hợp đồng Đặt cọc",
    keywords: [
      "giữ chỗ", "giu cho", "lock căn", "lock can", "đặt cọc", "dat coc",
      "hợp đồng đặt cọc", "chuyển cọc", "booking", "unit hold", "unit_hold", "deposit"
    ],
    srsDocPath: "appsale-v1/features/2.1-giu-cho-can/fsd.md",
    srsRuleSummary: "Sale có thể đăng ký giữ chỗ căn hộ theo thời hạn quy định và thực hiện chuyển cọc khi khách hàng thanh toán đủ tiền cọc.",
    businessLogicSummary:
      "Mỗi căn hộ chỉ cho phép tối đa số lượt giữ chỗ theo cấu hình dự án và mỗi phiếu giữ chỗ có thời gian hiệu lực đếm ngược. Khi hết thời gian giữ chỗ mà chưa chuyển cọc hoặc gia hạn, hệ thống tự động giải phóng căn cho người tiếp theo trong hàng đợi.",
    actionableSteps: [
      "Kiểm tra trạng thái căn trên Bảng hàng và thứ tự ưu tiên giữ chỗ.",
      "Thực hiện yêu cầu chuyển cọc kèm ảnh chụp UNC thanh toán trước khi hết thời gian giữ chỗ."
    ],
    snippets: [
      {
        repo: "app-sale-backend",
        filePath: "apps/bookings/services/unit_hold_service.py",
        startLine: 45,
        endLine: 115,
        functionOrClass: "UnitHoldService.create_hold",
        description: "Kiểm tra giới hạn số lượng giữ chỗ tối đa và thời gian hiệu lực lock căn",
      },
    ],
  },
  {
    id: "notifications_fcm_celery",
    moduleName: "Hệ thống Thông báo & Push Notification",
    keywords: [
      "thông báo", "thong bao", "notification", "notifications", "fcm", "firebase",
      "celery", "tasks.py", "bắn thông báo", "gửi thông báo", "push notification", "device token"
    ],
    srsDocPath: "appsale-v1/features/0.1-tong-quan-va-nen-tang/fsd.md",
    srsRuleSummary: "Hệ thống gửi thông báo in-app và Push Notification (FCM) bất đồng bộ khi có sự kiện duyệt phiếu, giữ chỗ hoặc cập nhật trạng thái.",
    businessLogicSummary:
      "Thông báo được gửi tự động ngầm ngay khi có thay đổi trạng thái phiếu hoặc sự kiện mới. Nếu người dùng không nhận được thông báo đẩy trên điện thoại, nguyên nhân thường do ứng dụng chưa cấp quyền thông báo hoặc phiên đăng nhập thiết bị đã hết hạn.",
    actionableSteps: [
      "Kiểm tra mục Thông báo bên trong ứng dụng xem bản tin đã được ghi nhận chưa.",
      "Đăng xuất và đăng nhập lại trên ứng dụng di động để làm mới kết nối nhận thông báo."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/notifications/tasks.py",
        startLine: 1,
        endLine: 120,
        functionOrClass: "send_push_notification_task",
        description: "Celery tasks xử lý gửi thông báo đẩy (FCM) và tự động vô hiệu hóa token hết hạn",
      },
      {
        repo: "backend",
        filePath: "apps/notifications/fcm_service.py",
        startLine: 1,
        endLine: 100,
        functionOrClass: "FCMService.send_multicast",
        description: "Dịch vụ FCMService gửi thông báo qua Firebase Cloud Messaging",
      },
    ],
  },
  {
    id: "hrm_timesheet_work_history",
    moduleName: "Chấm công, Bảng công Tháng & Lịch sử Công tác (MVLGO-55 / MVLGO-211)",
    keywords: [
      "mvlgo-55", "mvlgo-211", "chấm công", "cham cong", "bảng công", "bang cong",
      "công chuẩn", "cong chuan", "ngày công", "ngay cong", "lịch sử công tác",
      "điều động", "bổ nhiệm", "miễn nhiệm", "kiêm nhiệm", "timesheet", "attendance"
    ],
    srsDocPath: "features/hrm/6.4-monthly-timesheet/fsd.md",
    srsRuleSummary: "Bảng công tháng tổng hợp công thực tế, nghỉ phép/công tác đã duyệt và ngày lễ; Lịch sử công tác lưu vết phòng ban và chức danh theo thời điểm hiệu lực.",
    businessLogicSummary:
      "Bảng công tháng tự động tổng hợp dữ liệu chấm công (check-in/out), đơn nghỉ phép/công tác đã duyệt và ngày lễ để tính Tổng công hưởng lương so với Công chuẩn tháng. Đối với Lịch sử công tác, khi quyết định Điều động / Bổ nhiệm / Miễn nhiệm chuyển sang Đã hiệu lực, hệ thống tự động cập nhật phòng ban, chức danh hiện tại của nhân sự và lưu vết lịch sử công tác phục vụ tính lương & hoa hồng theo đúng thời điểm.",
    actionableSteps: [
      "Kiểm tra các đơn từ (nghỉ phép, giải trình chấm công, công tác) đã được Quản lý phê duyệt trước khi chốt bảng công.",
      "Kiểm tra Ngày hiệu lực trên Quyết định điều động/bổ nhiệm để hệ thống ghi nhận đúng phòng ban và vai trò quản lý trong kỳ."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/hrm/services/timesheet_service.py",
        startLine: 40,
        endLine: 115,
        functionOrClass: "TimesheetService.calculate_monthly_timesheet",
        description: "Tính tổng công hưởng lương và đối chiếu công chuẩn tháng",
        codePreview: `total_paid_days = attendance_days + approved_leave_days + holiday_days\nsummary.standard_days = get_branch_standard_working_days(month, year)`,
      },
    ],
  },
  {
    id: "pbtv_fee_progress_dial",
    moduleName: "Bảng tính Phí Dịch vụ Tư vấn (PBTV) & Tiến độ về Phí",
    keywords: [
      "pbtv", "phí dịch vụ", "phi dich vu", "phí tư vấn", "phi tu van",
      "tiến độ về phí", "tien do ve phi", "tỷ lệ về phí", "ty le ve phi",
      "chia phí", "chia phi", "cộng tác viên", "ctv", "commission_sheet"
    ],
    srsDocPath: "features/accounting/20.2-commission-calculation-sheet/fsd.md",
    srsRuleSummary: "PBTV xác định tổng phí dịch vụ nhận từ CĐT và phân bổ hoa hồng theo đúng tỷ lệ % tiến độ về phí thực thu.",
    businessLogicSummary:
      "Phiếu Bảng tính phí dịch vụ tư vấn (PBTV) xác định tổng phí dịch vụ nhận từ CĐT và phân bổ hoa hồng cho các đối tượng (Sale, CTV, Sàn liên kết, TPKD, GĐKD, GĐDA). Tỷ lệ tiến độ về phí được tính bằng Tổng tiền phí CĐT đã thanh toán thực tế (từ các Phiếu đối chiếu CĐT / Thu tiền) chia cho Tổng phí dịch vụ theo hợp đồng. Hệ thống chỉ cho phép chi trả hoa hồng theo đúng tỷ lệ % tiến độ về phí đã thu được từ CĐT.",
    actionableSteps: [
      "Kiểm tra Phiếu đối chiếu CĐT và chứng từ thu tiền phí dịch vụ đã được xác nhận chưa.",
      "Mở PBTV để kiểm tra Tỷ lệ về phí (%) và hạn mức hoa hồng được phép giải ngân trong đợt."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/commission_sheet_service.py",
        startLine: 150,
        endLine: 220,
        functionOrClass: "CommissionSheetService.calculate_fee_progress",
        description: "Tính tỷ lệ tiến độ về phí và hạn mức giải ngân hoa hồng trên PBTV",
        codePreview: `fee_progress_ratio = min(Decimal('1.0'), collected_fee_amount / total_contract_fee)\npayable_commission = total_role_commission * fee_progress_ratio`,
      },
    ],
  },
  {
    id: "gdda_project_director_commission",
    moduleName: "Hoa hồng Giám đốc Dự án (GĐDA) & Thư ký Dự án",
    keywords: [
      "gđda", "gdda", "giám đốc dự án", "giam doc du an", "thư ký dự án", "thu ky du an",
      "hoa hồng dự án", "hoa hong du an", "project director commission", "20.20"
    ],
    srsDocPath: "features/accounting/20.20-project-director-commission/fsd.md",
    srsRuleSummary: "Hoa hồng GĐDA và Thư ký dự án tính theo chính sách dự án và tiến độ về phí của PBTV.",
    businessLogicSummary:
      "Hoa hồng Giám đốc dự án (GĐDA) và Thư ký dự án được tính dựa trên chính sách hoa hồng của từng dự án và gắn liền với tiến độ về phí của giao dịch (PBTV). Nếu một dự án có nhiều GĐDA đồng phụ trách hoặc thay đổi GĐDA theo giai đoạn, hệ thống phân bổ tỷ lệ hưởng dựa trên cấu hình nhân sự phụ trách dự án tại thời điểm phát sinh giao dịch.",
    actionableSteps: [
      "Kiểm tra cấu hình Nhân sự phụ trách dự án (GĐDA / Thư ký dự án) và tỷ lệ hưởng trong Chính sách dự án.",
      "Kiểm tra trạng thái PBTV đã được duyệt và tỷ lệ về phí của giao dịch."
    ],
    snippets: [
      {
        repo: "backend",
        filePath: "apps/accounting/services/project_director_commission_service.py",
        startLine: 80,
        endLine: 145,
        functionOrClass: "ProjectDirectorCommissionService.calculate",
        description: "Tính và phân bổ hoa hồng Giám đốc dự án (GĐDA) theo thời điểm giao dịch",
        codePreview: `for director_cfg in project.director_configs.active_at(deal.transaction_date):\n    amount = base_commission * director_cfg.share_rate * fee_progress_ratio`,
      },
    ],
  },
  {
    id: "appsale_cms_erp_sync",
    moduleName: "Đồng bộ Dự án, Quỹ căn & Bảng hàng từ ERP sang AppSale CMS (MVLCTV-940)",
    keywords: [
      "mvlctv-940", "mvlctv-904", "mvlctv-905", "đồng bộ", "dong bo", "quỹ căn", "quy can",
      "bảng hàng", "bang hang", "cms", "appsale", "app sale", "update_or_create"
    ],
    srsDocPath: "appsale-v1/features/3.1-cms-portal/brd.md",
    srsRuleSummary: "Đồng bộ Dự án và Quỹ căn từ ERP sang AppSale bảo toàn dữ liệu tiếp thị đã biên tập trên CMS.",
    businessLogicSummary:
      "Dữ liệu gốc của Dự án và Quỹ căn (mã căn, tòa, tầng, diện tích, giá niêm yết, trạng thái kho hàng) được quản lý tại ERP và đồng bộ tự động sang AppSale theo cơ chế cập nhật bảo toàn dữ liệu (không xóa trắng rồi tạo lại). Các thông tin phục vụ bán hàng và tiếp thị do Admin biên tập thêm trên AppSale CMS (ảnh mặt bằng, tài liệu bán hàng, mô tả truyền thông) luôn được giữ nguyên khi ERP đồng bộ giá hoặc trạng thái căn mới.",
    actionableSteps: [
      "Cập nhật thông tin gốc (giá, diện tích, trạng thái căn) trên phân hệ Dự án/Bảng hàng của ERP.",
      "Cập nhật hình ảnh truyền thông, tài liệu bán hàng và hiển thị trên cổng AppSale CMS."
    ],
    snippets: [
      {
        repo: "app-sale-backend",
        filePath: "apps/projects/services/erp_sync_service.py",
        startLine: 55,
        endLine: 130,
        functionOrClass: "ErpProjectSyncService.sync_project_and_units",
        description: "Đồng bộ dự án và quỹ căn từ ERP bằng update_or_create bảo toàn dữ liệu CMS",
        codePreview: `unit, _ = Unit.objects.update_or_create(erp_id=payload['id'], defaults=erp_core_fields)`,
      },
    ],
  },
];

/**
 * Trích xuất các cụm thông báo lỗi cụ thể từ câu truy vấn hoặc payload JSON
 */
function extractErrorPhrases(query: string): string[] {
  const phrases: string[] = [];

  const detailMatch = query.match(/['"]detail['"]\s*:\s*['"]([^'"]+)['"]/i);
  if (detailMatch && detailMatch[1]) {
    phrases.push(detailMatch[1].trim());
  }

  const msgMatch = query.match(/['"]message['"]\s*:\s*['"]([^'"]+)['"]/i);
  if (msgMatch && msgMatch[1]) {
    phrases.push(msgMatch[1].trim());
  }

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
 * Tìm các miền nghiệp vụ (DomainLogicEntry) khớp với câu hỏi của người dùng
 */
export function matchDomainLogicEntries(query: string): DomainLogicEntry[] {
  const q = query.toLowerCase();
  const matched: Array<{ entry: DomainLogicEntry; score: number }> = [];

  for (const domain of DOMAIN_CODE_MAP) {
    let matchCount = 0;
    for (const kw of domain.keywords) {
      if (q.includes(kw)) {
        if (/^(?:mvl|mvlgo|mvlctv)-\d+$|^86[a-z0-9]{6,}$/i.test(kw)) {
          matchCount += 8;
        } else if (kw.length >= 10) {
          matchCount += 2;
        } else {
          matchCount += 1;
        }
      }
    }

    // Kiểm tra thêm theo tên file, hàm hoặc class trong snippets của domain
    for (const snip of domain.snippets) {
      const baseFile = snip.filePath.split("/").pop()?.toLowerCase() || "";
      if (baseFile && q.includes(baseFile)) {
        matchCount += 3;
      }
      if (snip.functionOrClass) {
        const parts = snip.functionOrClass.toLowerCase().split(".");
        for (const p of parts) {
          if (p.length >= 4 && q.includes(p)) {
            matchCount += 2;
          }
        }
      }
    }

    if (
      matchCount >= 1 &&
      (matchCount >= 2 ||
        domain.keywords.some((kw) => kw.length >= 7 && q.includes(kw)))
    ) {
      matched.push({ entry: domain, score: matchCount });
    }
  }

  return matched.sort((a, b) => b.score - a.score).map((m) => m.entry);
}

/**
 * Tự động trích xuất ngữ cảnh logic hệ thống & mã nguồn dựa trên câu query.
 * - Khi allowTech = false (Business Mode): Trả về quy tắc nghiệp vụ đã đối chiếu từ code (100% ngôn ngữ nghiệp vụ, không rò rỉ code).
 * - Khi allowTech = true (Tech Mode / "check code"): Trả về cả giải thích nghiệp vụ lẫn đường dẫn file, hàm, dòng code và snippet thực tế.
 */
export async function getSmartCodeContext(
  query: string,
  github?: GitHubClient,
  options?: { allowTech?: boolean }
): Promise<string> {
  const allowTech = options?.allowTech ?? isTechRequested(query);
  const matchedDomains = matchDomainLogicEntries(query);

  // Nếu ở chế độ Business (không yêu cầu "check code"), chỉ cung cấp Logic Nghiệp Vụ Thực Tế sạch sẽ
  if (!allowTech) {
    if (matchedDomains.length === 0) {
      return "";
    }
    let businessGrounding = "\n\n=== LOGIC HỆ THỐNG THỰC TẾ ĐÃ XÁC Thực (DÙNG ĐỂ TRẢ LỜI CHÍNH XÁC NGHIỆP VỤ) ===\n";
    for (const dom of matchedDomains.slice(0, 2)) {
      businessGrounding += `\n• Phân hệ: ${dom.moduleName}\n`;
      businessGrounding += `• Quy tắc vận hành thực tế: ${dom.businessLogicSummary}\n`;
      businessGrounding += `• Các bước xử lý trên giao diện: ${dom.actionableSteps.map((s, i) => `(${i + 1}) ${s}`).join(" ")}\n`;
    }
    return businessGrounding;
  }

  // Chế độ Tech ("check code"): Thu thập đầy đủ file, hàm, dòng code
  const matchedSnippets: PreloadedCodeSnippet[] = [];

  // 1. Trích xuất file path cụ thể trong query
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

  for (const dom of matchedDomains) {
    for (const snip of dom.snippets) {
      if (!matchedSnippets.some((s) => s.filePath === snip.filePath && s.startLine === snip.startLine)) {
        matchedSnippets.push(snip);
      }
    }
  }

  let codeContext = "\n\n=== MÃ NGUỒN & LOGIC KỸ THUẬT TỪ REPO HỆ THỐNG (MVL-ERP) ===\n";
  for (const dom of matchedDomains.slice(0, 2)) {
    codeContext += `\n[Tóm tắt Logic Hệ thống - ${dom.moduleName}]: ${dom.businessLogicSummary}\n`;
  }

  for (const snip of matchedSnippets.slice(0, 4)) {
    let loadedContent = snip.codePreview || "";
    let startLine = snip.startLine || 1;
    let endLine = snip.endLine || 100;

    if (github) {
      try {
        const fileRes = await github.readFile(snip.repo, snip.filePath, {
          startLine: snip.startLine,
          endLine: snip.endLine,
        });
        loadedContent = fileRes.content;
        startLine = fileRes.startLine || startLine;
        endLine = fileRes.endLine || endLine;
      } catch {
        // Fallback an toàn về codePreview có sẵn nếu GitHub API timeout/offline
      }
    }

    codeContext += `\n[File: ${snip.repo}/${snip.filePath} (Dòng ${startLine}-${endLine})] - Hàm/Class: ${snip.functionOrClass || "N/A"} - ${snip.description}:\n`;
    if (loadedContent) {
      codeContext += "```python\n" + loadedContent + "\n```\n";
    }
  }

  // Tra cứu động theo thông báo lỗi nếu có github
  if (github && matchedSnippets.length === 0) {
    const errorPhrases = extractErrorPhrases(query);
    for (const phrase of errorPhrases.slice(0, 2)) {
      const cleanPhrase = phrase.replace(/[^\w\s\.\_\-]/g, " ").trim();
      if (cleanPhrase.length < 5) continue;
      try {
        const searchResults = await github.searchCode("backend", cleanPhrase);
        const codeFiles = searchResults.filter((f) => /\.(py|ts|tsx)$/i.test(f.path));
        if (codeFiles.length > 0) {
          const targetFile = codeFiles[0];
          const keywordToFind = cleanPhrase.split(" ").slice(0, 4).join(" ");
          const fileContent = await github.readFile("backend", targetFile.path, {
            searchKeyword: keywordToFind,
          });
          codeContext += `\n[File: backend/${targetFile.path} (Dòng ${fileContent.startLine || 1}-${fileContent.endLine || fileContent.totalLines})]:\n\`\`\`python\n${fileContent.content}\n\`\`\`\n`;
        }
      } catch {}
    }
  }

  return matchedDomains.length > 0 || matchedSnippets.length > 0 ? codeContext : "";
}
