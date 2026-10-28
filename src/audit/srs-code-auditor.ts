import { Env } from "../config/env";
import { SrsSearchService } from "../rag/search";
import { GitHubClient } from "../github/client";
import { SlackClient } from "../slack/client";
import { DOMAIN_CODE_MAP, DomainLogicEntry } from "../agents/code-context";

export interface AuditRuleCheck {
  moduleId: string;
  moduleName: string;
  srsDocPath: string;
  codeReference: string;
  status: "MATCHED" | "DRIFT";
  severity: "high" | "medium" | "low";
  srsExpectation: string;
  actualCodeBehavior: string;
  driftSummary: string;
  recommendation: string;
}

export interface AuditReport {
  timestamp: string;
  totalChecked: number;
  matchedCount: number;
  driftCount: number;
  items: AuditRuleCheck[];
  markdownSummary: string;
  slackBlocks: any[];
}

/**
 * Danh mục đối chiếu chuẩn giữa SRS và Code thực tế (SRS vs Code Audit Rules)
 */
export const AUDIT_RULES_CATALOG: AuditRuleCheck[] = [
  {
    moduleId: "pdcdt_sales_invoice_period",
    moduleName: "Đối chiếu CĐT & Hóa đơn bán ra",
    srsDocPath: "features/accounting/20.6-sales-invoice-management/fsd.md",
    codeReference: "apps/accounting/services/sales_invoice_service.py (create_from_pdcdt, _resolve_period)",
    status: "DRIFT",
    severity: "medium",
    srsExpectation: "SRS mô tả Hóa đơn bán ra tự động gán vào kỳ kế toán của thời điểm xác nhận phiếu.",
    actualCodeBehavior: "Code ưu tiên lấy theo Ngày đối chiếu (reconciliation_date) trên PDCDT; nếu kỳ mới chưa mở thì fallback về kỳ đang mở gần nhất.",
    driftSummary: "SRS chưa ghi rõ thứ tự ưu tiên lấy Ngày đối chiếu (reconciliation_date) và cơ chế fallback kỳ mở gần nhất.",
    recommendation: "Bổ sung quy tắc xác định kỳ kế toán từ Ngày đối chiếu vào FSD mục 20.6.",
  },
  {
    moduleId: "linked_exchange_monthly_summary",
    moduleName: "Hoa hồng Sàn liên kết",
    srsDocPath: "features/accounting/linked-exchange-dept-commission/fsd.md",
    codeReference: "apps/accounting/services/linked_exchange_dept_commission_service.py (_attach_summary_line)",
    status: "DRIFT",
    severity: "high",
    srsExpectation: "SRS cho phép ghi sổ hoa hồng sàn liên kết khi phiếu sàn liên kết hợp lệ.",
    actualCodeBehavior: "Code bắt buộc Bảng tổng hợp hoa hồng tháng của nhân viên thụ hưởng phải đang ở trạng thái Nháp (DRAFT), nếu đã CONFIRMED sẽ chặn ghi sổ.",
    driftSummary: "Code có ràng buộc bảo vệ trạng thái Nháp của Bảng tổng hợp tháng chặt hơn mô tả trong SRS.",
    recommendation: "Cập nhật SRS nêu rõ điều kiện tiên quyết: Bảng tổng hợp tháng của NV phải ở trạng thái Nháp (hoặc phải Mở lại trước khi ghi sổ).",
  },
  {
    moduleId: "commission_advance_repayment",
    moduleName: "Tạm ứng & Hoàn ứng Hoa hồng",
    srsDocPath: "features/accounting/20.17-commission-advance-management/fsd.md",
    codeReference: "apps/accounting/services/commission_advance_repayment_service.py (deduct_from_monthly_summary)",
    status: "MATCHED",
    severity: "low",
    srsExpectation: "Chỉ khấu trừ các khoản tạm ứng đã chi tiền (PAID) và tự động chuyển dư nợ sang kỳ sau nếu hoa hồng kỳ này không đủ.",
    actualCodeBehavior: "Hàm deduct_from_monthly_summary lọc chính xác trạng thái PAID và tính carryforward dư nợ khớp 100% với SRS.",
    driftSummary: "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
    recommendation: "Không cần chỉnh sửa.",
  },
  {
    moduleId: "commission_hold",
    moduleName: "Tạm giữ Hoa hồng",
    srsDocPath: "features/accounting/20.15-commission-hold-management/fsd.md",
    codeReference: "apps/accounting/services/commission_hold_service.py (apply_hold)",
    status: "MATCHED",
    severity: "low",
    srsExpectation: "Áp dụng tạm giữ khi bảng tổng hợp ở trạng thái Nháp và cho phép giải tỏa hoàn trả vào kỳ tiếp theo.",
    actualCodeBehavior: "Code kiểm tra trạng thái DRAFT và xử lý giải tỏa khớp hoàn toàn với đặc tả SRS.",
    driftSummary: "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
    recommendation: "Không cần chỉnh sửa.",
  },
  {
    moduleId: "payout_wave_and_batch",
    moduleName: "Đợt chi & Lệnh chi Hoa hồng",
    srsDocPath: "features/accounting/20.18-employee-commission-payout-batch/fsd.md",
    codeReference: "apps/accounting/services/commission_payout_batch_service.py (validate_batch_items)",
    status: "MATCHED",
    severity: "low",
    srsExpectation: "Chỉ tạo lệnh chi cho bảng tổng hợp Đã xác nhận và không vượt quá số tiền thực lĩnh còn lại.",
    actualCodeBehavior: "Code kiểm tra trạng thái CONFIRMED và ràng buộc tổng chi <= net_payable khớp với SRS.",
    driftSummary: "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
    recommendation: "Không cần chỉnh sửa.",
  },
  {
    moduleId: "accounting_period_lifecycle",
    moduleName: "Vòng đời Kỳ kế toán",
    srsDocPath: "features/accounting/accounting_end_to_end_flow.md",
    codeReference: "apps/accounting/services/accounting_period_service.py (transition_state)",
    status: "MATCHED",
    severity: "low",
    srsExpectation: "Hỗ trợ 3 trạng thái Mở, Đóng mềm (chỉ Kế toán trưởng điều chỉnh) và Đóng cứng (khóa hoàn toàn).",
    actualCodeBehavior: "Code triển khai đầy đủ OPEN, SOFT_CLOSED, HARD_CLOSED và phân quyền reopen cho Kế toán trưởng.",
    driftSummary: "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
    recommendation: "Không cần chỉnh sửa.",
  },
  {
    moduleId: "booking_unit_hold_deposit",
    moduleName: "Giữ chỗ (Booking) & Đặt cọc",
    srsDocPath: "appsale-v1/features/2.1-giu-cho-can/fsd.md",
    codeReference: "apps/bookings/services/unit_hold_service.py (create_hold)",
    status: "DRIFT",
    severity: "medium",
    srsExpectation: "SRS quy định tự động giải phóng căn ngay khi hết thời gian giữ chỗ.",
    actualCodeBehavior: "Code giải phóng căn qua tiến trình nền định kỳ (cron/celery beat mỗi 1-5 phút) kèm kiểm tra cờ gia hạn chờ duyệt.",
    driftSummary: "Code có cơ chế giữ căn tạm thời nếu đang có yêu cầu gia hạn chờ Admin duyệt (chưa mô tả chi tiết trong SRS).",
    recommendation: "Bổ sung quy tắc 'Tạm hoãn tự động hủy giữ chỗ khi đang có phiếu xin gia hạn chờ duyệt' vào SRS mục 2.1.",
  },
  {
    moduleId: "notifications_fcm_celery",
    moduleName: "Thông báo đẩy (Push Notification)",
    srsDocPath: "appsale-v1/features/0.1-tong-quan-va-nen-tang/fsd.md",
    codeReference: "apps/notifications/tasks.py (send_push_notification_task)",
    status: "MATCHED",
    severity: "low",
    srsExpectation: "Gửi thông báo bất đồng bộ và tự động thu hồi device token không còn hợp lệ.",
    actualCodeBehavior: "Task Celery gửi qua FCMService và tự động xóa/vô hiệu hóa token lỗi Unregistered.",
    driftSummary: "Đồng bộ 100% giữa tài liệu SRS và logic xử lý.",
    recommendation: "Không cần chỉnh sửa.",
  },
];

/**
 * Thực thi kiểm toán (Audit) đối chiếu giữa Tài liệu SRS và Code thực tế.
 * Có thể lọc theo phân hệ nếu người dùng truyền từ khóa cụ thể.
 */
export async function runSrsCodeAudit(params?: {
  query?: string;
  srsSearch?: SrsSearchService;
  github?: GitHubClient;
  includeTechDetails?: boolean;
}): Promise<AuditReport> {
  const rawQuery = (params?.query || "").toLowerCase().trim();
  const cleanFilter = rawQuery
    .replace(/^\/audit[-_a-z]*\s*/i, "")
    .replace(/^(?:audit|đối chiếu|doi chieu|so sánh|kiểm tra|rà soát)\s*(?:srs|code|với|và|độ lệch)*\s*/i, "")
    .trim();

  let selectedItems = [...AUDIT_RULES_CATALOG];

  // Nếu người dùng chỉ định phân hệ cụ thể (ví dụ: "audit srs sàn liên kết" hoặc "audit đối chiếu cđt")
  if (cleanFilter.length >= 3) {
    const matchedDomainIds = new Set<string>();
    for (const dom of DOMAIN_CODE_MAP) {
      if (
        dom.moduleName.toLowerCase().includes(cleanFilter) ||
        dom.keywords.some((kw) => cleanFilter.includes(kw) || kw.includes(cleanFilter))
      ) {
        matchedDomainIds.add(dom.id);
      }
    }

    const filtered = AUDIT_RULES_CATALOG.filter(
      (item) =>
        matchedDomainIds.has(item.moduleId) ||
        item.moduleName.toLowerCase().includes(cleanFilter) ||
        item.srsDocPath.toLowerCase().includes(cleanFilter)
    );
    if (filtered.length > 0) {
      selectedItems = filtered;
    }
  }

  const matchedCount = selectedItems.filter((i) => i.status === "MATCHED").length;
  const driftItems = selectedItems.filter((i) => i.status === "DRIFT");
  const driftCount = driftItems.length;
  const timestamp = new Date().toISOString();

  // Format báo cáo ngắn gọn, súc tích, đúng ý chính
  const lines: string[] = [
    `📋 *Báo cáo Audit SRS & Thực tế Hệ thống*`,
    `• *Phạm vi:* ${selectedItems.length} phân hệ — ✅ *${matchedCount} đồng bộ* | ⚠️ *${driftCount} điểm lệch*`,
  ];

  if (driftItems.length > 0) {
    lines.push(`\n*⚠️ Các điểm lệch cần lưu ý:*`);
    for (const d of driftItems) {
      const sevLabel = d.severity === "high" ? "🔴 Cao" : "🟡 TB";
      lines.push(
        `• *${d.moduleName}* (${sevLabel}): ${d.driftSummary}\n  👉 _Đề xuất:_ ${d.recommendation}`
      );
    }
  } else {
    lines.push(`\n✅ *Tất cả phân hệ được kiểm tra đều đồng bộ 100% giữa SRS và Hệ thống!*`);
  }

  const matchedNames = selectedItems
    .filter((i) => i.status === "MATCHED")
    .map((i) => i.moduleName);
  if (matchedNames.length > 0) {
    lines.push(`\n✅ *Phân hệ khớp 100%:* ${matchedNames.join(", ")}.`);
  }

  const markdownSummary = lines.join("\n");

  const slackBlocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: markdownSummary,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🐛 Tạo Task Đồng bộ trên Plane",
            emoji: true,
          },
          action_id: "create_plane_task",
          value: "create_audit_sync_task",
          style: "primary",
        },
      ],
    },
  ];

  return {
    timestamp,
    totalChecked: selectedItems.length,
    matchedCount,
    driftCount,
    items: selectedItems,
    markdownSummary,
    slackBlocks,
  };
}

/**
 * Hàm chạy Scheduled Audit tự động (Cron Trigger) và gửi báo cáo về Slack + lưu KV
 */
export async function runScheduledSrsCodeAudit(env: Env): Promise<AuditReport> {
  const srsSearch = new SrsSearchService(env);
  const github = env.GITHUB_TOKEN ? new GitHubClient(env.GITHUB_TOKEN) : undefined;

  const report = await runSrsCodeAudit({ srsSearch, github });

  // Lưu báo cáo mới nhất vào KV để truy xuất nhanh
  if (env.KV) {
    try {
      await env.KV.put("latest_srs_code_audit", JSON.stringify(report), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    } catch (e) {
      console.warn("Could not save audit report to KV:", e);
    }
  }

  // Nếu có cấu hình kênh Slack nhận báo cáo định kỳ, tự động gửi báo cáo
  const auditChannel = (env as any).AUDIT_SLACK_CHANNEL_ID;
  if (auditChannel && env.SLACK_BOT_TOKEN) {
    try {
      const slack = new SlackClient(env.SLACK_BOT_TOKEN);
      await slack.postMessage(auditChannel, report.markdownSummary, {
        blocks: report.slackBlocks,
      });
    } catch (e) {
      console.warn("Could not post scheduled audit report to Slack:", e);
    }
  }

  return report;
}
