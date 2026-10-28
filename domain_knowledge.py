"""
Bản đồ Tri thức Lai Toàn diện (SRS + Code Logic — Các phân hệ cốt lõi MVL).
Tách biệt dữ liệu tĩnh khỏi gemini_agent.py giúp kiến trúc tinh gọn, dễ bảo trì.
"""
from typing import Any, Dict, List

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
        "id": "manager_monthly_hhql_column_and_tasks",
        "module_name": "Bảng Tổng kết Hoa hồng Quản lý Theo Tháng (manager-monthly) — Cột HHQL & Các Task Ẩn/Đổi tên Cột",
        "keywords": [
            "manager-monthly", "commission-management/manager-monthly",
            "bảng tổng kết hh quản lý theo tháng", "bang tong ket hh quan ly theo thang",
            "bảng tổng kết hoa hồng quản lý theo tháng", "hh theo tháng quản lý",
            "cột hhql", "cot hhql", "ẩn cột", "an cot", "đổi tên và ẩn cột",
            "mvl-3308", "3308", "86eyrhv87", "mvl-3314", "3314", "86eyrevc6",
            "86eyunfa5", "mvlgo-224", "mvlgo-227", "mvlgo-245", "mvl-3618", "86eyt06ga",
            "thưởng hh quản lý", "hh quản lý (tbc)", "commmgrmonthlytable", "20.14",
        ],
        "srs_doc": "features/accounting/20.14-monthly-beneficiary-commission-summary/fsd.md (§ 6.2b, § 6.2c, § 6.7)",
        "business_logic": (
            "Trên màn Bảng tổng kết Hoa hồng quản lý theo tháng (/accounting/commission-management/manager-monthly, đổi tên từ 'HH theo tháng — Quản lý' theo task MVL-3314 / ClickUp 86eyrevc6), "
            "cột 'HHQL' chỉ hiển thị phần Hoa hồng quản lý tháng tính theo % hoàn thành chỉ tiêu KPI phòng ban của 4 vai trò (TPKD, GĐKD, TGĐ, TP.TKKD) lấy từ mục ③ 'Hoa hồng quản lý KPI/HHQL' trên phiếu chi tiết; "
            "cột này tách riêng hoàn toàn với cột đứng ngay bên trái là 'Thưởng HH quản lý' (phần thưởng quản lý cố định theo từng giao dịch/căn nhân với % tiến độ về phí). "
            "Quy tắc hiển thị ô trên cột 'HHQL': hiển thị số tiền VNĐ khi giá trị khác 0 (cả số dương lẫn số âm màu đỏ khi bị điều chuyển/khấu trừ vượt), chỉ khi bằng 0 mới hiển thị dấu gạch ngang '—', và cuối bảng có dòng TỔNG CỘNG cộng tổng cột HHQL toàn kỳ từ hệ thống. "
            "Các task liên quan đến việc ẩn/đổi tên cột trên màn này gồm: "
            "(1) Task MVL-3308 (ClickUp 86eyrhv87 — '[CR] [HH theo tháng-quản lý] - Đổi tên và ẩn cột trong màn hình Danh sách'): đổi tên cột kế bên từ 'HH quản lý (TBC)' sang 'Thưởng HH quản lý' và ẩn/gỡ cột 'Thưởng' khỏi bảng danh sách & xuất Excel; "
            "(2) Task ClickUp 86eyunfa5 (SRS 20.14 § 6.2c): chỉ ẩn cột 'HH Đầu tư, Xúc tiến & PT Dự án' ở màn HH theo tháng — Sale, nhưng chốt GIỮ NGUYÊN KHÔNG ẨN cột 'HHQL' và các cột thành phần trên màn Bảng tổng kết HH quản lý theo tháng vì màn Quản lý có quy tắc bắt buộc 'Tổng các cột thành phần trên dòng = Cột Tổng HH'; "
            "(3) Task MVLGO-224 / MVLGO-227 & MVLGO-245: khôi phục đầy đủ các cột thành phần trên màn manager-monthly và đồng bộ 12 cột xuất Excel để cộng ngang khớp 100% với cột Tổng HH; "
            "(4) Task MVL-3618 (ClickUp 86eyt06ga) & PR #3050: gỡ màn vận hành HHQL riêng lẻ để gộp chung cột HHQL vào màn Bảng tổng kết HH quản lý theo tháng, đồng thời tách riêng màn chỉ-đọc 'Báo cáo Bảng hoa hồng hàng tháng HHQL' (/accounting/reports/hhql-monthly)."
        ),
        "steps": [
            "Đối chiếu giá trị cột 'HHQL' (hoa hồng quản lý theo % KPI phòng ban) tách biệt với cột 'Thưởng HH quản lý' (thưởng quản lý cố định theo giao dịch) ngay bên trái trên màn Bảng tổng kết HH quản lý theo tháng.",
            "Tra cứu trực tiếp các task Plane/ClickUp liên quan: MVL-3308 (86eyrhv87 — Đổi tên 'HH quản lý (TBC)' -> 'Thưởng HH quản lý' và ẩn cột 'Thưởng'), ClickUp 86eyunfa5 (quy định giữ nguyên không ẩn cột HHQL trên màn Quản lý để bảo toàn Tổng các cột thành phần = Tổng HH), MVLGO-224/MVLGO-245 và MVL-3618 (86eyt06ga).",
        ],
        "code_ref": "web/src/features/accounting/commissions/components/CommMgrMonthlyTable.tsx:L418-L453 & apps/accounting/services/monthly_summary_service.py:L221-L260",
        "code_snippet": (
            "// CommMgrMonthlyTable.tsx (L418-L453)\n"
            "{ title: 'Thưởng HH quản lý', key: 'hh_quan_ly', render: (_, r) => renderAmount(r.hh_quan_ly) },\n"
            "{ title: 'HHQL', key: 'hh_kpi_hhql', render: (_, r) => renderAmount(r.hh_kpi_hhql) },\n"
            "// renderAmount: Number(val) !== 0 ? formatCurrency(val) : '—'"
        ),
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa tài liệu SRS 20.14 (§ 6.2b, § 6.2c, § 6.7), các CR MVL-3308 / MVL-3314 / 86eyunfa5 / MVLGO-224 và giao diện CommMgrMonthlyTable.tsx.",
        "audit_recommendation": "Không cần chỉnh sửa.",
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
    {
        "id": "mvl_environments_and_chrome_mcp",
        "module_name": "Bản đồ 4 Tier Môi trường MVL, Tài khoản Test & Cấu hình Chrome DevTools MCP",
        "keywords": [
            "môi trường", "moi truong", "environment", "staging", "railway", "chrome mcp",
            "chrome devtools", "tài khoản test", "tai khoan test", "mvl.glinteco.com",
            "api.mvl.glinteco.com", "erp.maivietland.vn", "portal.maivietland.vn",
            "host-app-production.up.railway.app", "erp-web-production-bb1f.up.railway.app",
            "demo123", "tier 1", "tier 2", "tier 3",
        ],
        "srs_doc": ".agents/rules/environments.md & srs/docs/handover/ENVIRONMENT.md & .agents/reference/staging-test-accounts.md",
        "business_logic": (
            "Hệ sinh thái MVL được chia làm 4 tier môi trường chuẩn: "
            "(1) Tier 0 Local: ERP Web localhost:3000, ERP API 127.0.0.1:8000, AppSale API 127.0.0.1:8001, Host-App Shell localhost:3006 (bắt buộc test qua cổng 3006, cấm test trực tiếp cổng 3003); "
            "(2) Tier 1 Internal Dev: Cụm Glinteco (Web https://mvl.glinteco.com, API https://api.mvl.glinteco.com, Admin https://api.mvl.glinteco.com/admin/) và Cụm Railway Cloud (ERP Web https://erp-web-production-bb1f.up.railway.app, ERP API https://erp-backend-production-484d.up.railway.app, Host-App https://host-app-production.up.railway.app, AppSale API https://app-sale-backend-production.up.railway.app, CMS Admin https://cmsadmin-production-7b06.up.railway.app, CRM https://crm-production-0da1.up.railway.app, Storefront https://appsale-production.up.railway.app, Slack Agent https://mvl-slack-agent-dev.up.railway.app); "
            "(3) Tier 2 Client Staging/UAT: https://mvl.staging.mvl.glinteco.com (API https://api.staging.mvl.glinteco.com); "
            "(4) Tier 3 Production Thật: ERP https://erp.maivietland.vn, Portal https://portal.maivietland.vn, API https://api.maivietland.vn, Gateway https://api-gateway.maivietland.vn; "
            "cùng hệ thống quản lý task Plane tại https://pm.glinteco.com (workspace glinteco). "
            "Tài khoản kiểm thử cho Chrome MCP / Playwright (mật khẩu chung 'Demo123!@#'): 'admin' (Superuser toàn quyền), '0300622217' (4 chi nhánh), '0900124966' (1 chi nhánh Quảng Ninh), '0700124595' (TKKD/TKDA), '0900026794' (TP-TKKD)."
        ),
        "steps": [
            "Sử dụng Chrome MCP điều hướng tới môi trường Tier 1 (https://mvl.glinteco.com hoặc https://host-app-production.up.railway.app) và đăng nhập bằng tài khoản 'admin' / 'Demo123!@#'.",
            "Gọi API qua đúng cổng backend (https://api.mvl.glinteco.com hoặc https://erp-backend-production-484d.up.railway.app) kèm header Authorization: Bearer <localStorage.auth_token>.",
        ],
        "code_ref": "env_config.py:L1-L260 (MVL_ENVIRONMENTS, MVL_TEST_ACCOUNTS, format_environment_context_for_agent)",
        "code_snippet": "MVL_ENVIRONMENTS['tier_1_dev_glinteco']['services'] = {'erp_web': 'https://mvl.glinteco.com', 'erp_api': 'https://api.mvl.glinteco.com'}",
        "audit_status": "MATCHED",
        "audit_severity": "low",
        "audit_drift": "Đồng bộ 100% giữa .agents/rules/environments.md, srs/docs/handover/ENVIRONMENT.md và env_config.py.",
        "audit_recommendation": "Không cần chỉnh sửa.",
    },
]
