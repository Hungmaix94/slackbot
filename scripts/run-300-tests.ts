import * as fs from "fs";
import * as path from "path";
import { classifyIntent, isTechRequested, needsCodeContextUnderTheHood } from "../src/agents/router";
import { sanitizeAgentResponse } from "../src/agents/prompts";
import { getSmartCodeContext, DOMAIN_CODE_MAP } from "../src/agents/code-context";
import { extractBugHeuristically } from "../src/ai/task-extractor";
import { resolvePlaneProject } from "../src/plane/projects";
import { createAnswerBlocks, createTaskCreatedCard } from "../src/slack/blocks";
import { runSrsCodeAudit } from "../src/audit/srs-code-auditor";

export interface TestCaseIO {
  id: string;
  category:
    | "BUSINESS_QA"
    | "TECH_CHECK_CODE"
    | "FAST_PLANE_TASK"
    | "SCHEDULED_AND_ONDEMAND_AUDIT"
    | "BA_USECASE_AND_QA_TESTCASE"
    | "PROJECT_SEARCH_AND_GUARDRAILS";
  description: string;
  input: {
    query: string;
    channelId?: string;
    threadMessages?: Array<{ user: string; text: string }>;
    rawModelOutputToSanitize?: string;
  };
  expected_output: {
    intent: string;
    tech_mode: boolean;
    needs_code_grounding?: boolean;
    expected_project?: string;
    expected_task_type?: "bug" | "task";
    expected_module?: string;
    expected_assignee?: string;
    expected_priority?: string;
    forbidden_terms_in_output?: string[];
    required_terms_in_output?: string[];
    sample_output_message: string;
  };
}

function build330TestCases(): TestCaseIO[] {
  const cases: TestCaseIO[] = [];
  let idx = 1;
  const nextId = () => `TC-${String(idx++).padStart(3, "0")}`;

  // =========================================================================
  // NHÓM 1: BUSINESS_QA (90 Test Cases: TC-001 -> TC-090)
  // Hỏi đáp nghiệp vụ thuần túy, giải thích nguyên nhân lỗi thân thiện,
  // CẤM TUYỆT ĐỐI xuất hiện tên file code, hàm, class kỹ thuật.
  // =========================================================================
  const businessModules = [
    {
      topic: "Đối chiếu CĐT & Hóa đơn bán ra",
      questions: [
        "Vì sao duyệt phiếu đối chiếu CĐT tháng 9 mà hóa đơn bán ra lại nhảy vào kỳ hoa hồng tháng 8?",
        "Tại sao hóa đơn bán ra tự sinh từ phiếu đối chiếu CĐT lại nằm ở kỳ kế toán tháng trước?",
        "Khi xác nhận phiếu đối chiếu chủ đầu tư thì hệ thống tính kỳ hoa hồng của hóa đơn bán ra như thế nào?",
        "Cho mình hỏi quy tắc tự động tạo hóa đơn bán ra sau khi duyệt phiếu đối chiếu CĐT với ạ?",
        "Làm sao để đổi kỳ kế toán của hóa đơn bán ra khi bị lệch kỳ với phiếu đối chiếu CĐT?",
        "Phiếu đối chiếu CĐT ở trạng thái nào thì hệ thống mới tự tạo hóa đơn bán ra?",
        "Vì sao mình bấm xác nhận phiếu đối chiếu CĐT rồi mà tìm trong kỳ tháng 10 không thấy hóa đơn bán ra?",
        "Ngày đối chiếu trên phiếu đối chiếu CĐT ảnh hưởng gì đến kỳ hoa hồng của hóa đơn bán ra?",
        "Kế toán muốn điều chỉnh lại kỳ hoa hồng của hóa đơn bán ra vừa sinh từ phiếu đối chiếu thì làm thế nào?",
        "Quy trình từ lúc lập phiếu đối chiếu CĐT đến khi lên hóa đơn bán ra gồm những bước nào?",
      ],
      sampleAnswer:
        "💡 *Hóa đơn bán ra được xác định kỳ kế toán dựa theo Ngày đối chiếu trên Phiếu đối chiếu CĐT (chứ không tính theo ngày bấm duyệt).*\n• *Nguyên nhân:* Nếu Ngày đối chiếu thuộc tháng 8 (hoặc kỳ tháng 9 chưa mở nên hệ thống lấy kỳ đang mở gần nhất), hóa đơn sẽ vào kỳ tháng 8.\n👉 *Cách xử lý:* Kiểm tra lại Ngày đối chiếu trên phiếu và mở kỳ kế toán tháng mới trước khi xác nhận.",
    },
    {
      topic: "Hoa hồng Sàn liên kết & Bảng tổng hợp tháng",
      questions: [
        "Tại sao mình không ghi sổ được hoa hồng sàn liên kết cho nhân viên trong kỳ này?",
        "Hệ thống báo lỗi bảng tổng hợp hoa hồng nhân viên phải ở trạng thái nháp khi ghi sổ sàn liên kết là sao?",
        "Vì sao bấm ghi sổ hoa hồng sàn liên kết lại bị chặn không cho đẩy vào bảng tổng hợp tháng?",
        "Làm thế nào để ghi sổ bổ sung hoa hồng sàn liên kết khi bảng tổng hợp tháng của sale đã lỡ bấm xác nhận?",
        "Quy trình ghi sổ hoa hồng theo tháng của sàn liên kết sang bảng tổng hợp nhân viên hoạt động ra sao?",
        "Khi bảng tổng hợp hoa hồng tháng của nhân viên đã chốt thì có ghi sổ thêm hoa hồng sàn liên kết được không?",
        "Hướng dẫn mình cách mở lại bảng tổng hợp hoa hồng nhân viên về nháp để ghi sổ sàn liên kết với!",
        "Điều kiện để ghi sổ thành công phiếu hoa hồng sàn liên kết vào cuối tháng là gì?",
        "Ai có quyền mở lại bảng tổng hợp hoa hồng tháng của nhân viên khi cần ghi sổ bổ sung sàn liên kết?",
        "Sau khi mở lại bảng tổng hợp về nháp và ghi sổ sàn liên kết xong thì cần làm bước gì tiếp theo?",
      ],
      sampleAnswer:
        "💡 *Hệ thống chặn ghi sổ vì Bảng tổng hợp hoa hồng tháng của nhân viên thụ hưởng đã được Xác nhận/Chốt số liệu.*\n• *Quy tắc:* Bảng tổng hợp tháng của nhân viên phải đang ở trạng thái *Nháp* thì mới nhận thêm được dòng hoa hồng từ Sàn liên kết.\n👉 *Cách xử lý:* (1) Mở Bảng tổng hợp hoa hồng tháng của nhân viên -> (2) Bấm *Mở lại* về Nháp -> (3) Ghi sổ lại Hoa hồng sàn liên kết.",
    },
    {
      topic: "Tạm ứng & Hoàn ứng Hoa hồng",
      questions: [
        "Quy trình tạo và phê duyệt phiếu tạm ứng hoa hồng cho nhân viên kinh doanh gồm mấy bước?",
        "Vì sao khoản tạm ứng hoa hồng của nhân viên chưa được khấu trừ tự động trên bảng tổng hợp tháng này?",
        "Khi nào thì hệ thống mới tự động trừ tiền tạm ứng trên bảng tổng hợp hoa hồng tháng?",
        "Nếu hoa hồng tháng này của sale thấp hơn số tiền đã tạm ứng thì phần dư nợ còn lại xử lý thế nào?",
        "Hạn mức tối đa được phép tạm ứng hoa hồng trên một giao dịch được quy định ra sao?",
        "Phiếu tạm ứng đang ở trạng thái Đã duyệt nhưng chưa chi tiền thì có bị khấu trừ vào lương hoa hồng tháng không?",
        "Cách kiểm tra số dư nợ tạm ứng hoa hồng chuyển sang kỳ sau của một nhân viên trên hệ thống?",
        "Nhân viên nghỉ việc còn dư nợ tạm ứng hoa hồng thì kế toán thu hồi hoàn ứng trên màn hình nào?",
        "Tại sao nhân viên không tạo được phiếu tạm ứng hoa hồng mới dù giao dịch đã đặt cọc?",
        "Sự khác nhau giữa khấu trừ tạm ứng tự động cuối tháng và thu hồi hoàn ứng trực tiếp là gì?",
      ],
      sampleAnswer:
        "💡 *Hệ thống chỉ tự động khấu trừ các phiếu tạm ứng đã ở trạng thái Đã chi tiền và còn dư nợ.*\n• *Quy tắc:* Nếu hoa hồng thực nhận trong kỳ nhỏ hơn dư nợ tạm ứng, phần còn thiếu sẽ tự động chuyển sang kỳ tiếp theo để khấu trừ tiếp.\n👉 *Cách xử lý:* Kiểm tra phiếu tạm ứng đã chuyển sang trạng thái *Đã chi tiền* chưa và đối chiếu cột *Khấu trừ tạm ứng* trên Bảng tổng hợp tháng.",
    },
    {
      topic: "Tạm giữ Hoa hồng",
      questions: [
        "Quy định về tạm giữ hoa hồng của nhân viên kinh doanh trên bảng tổng hợp tháng như thế nào?",
        "Vì sao kế toán không thêm hoặc sửa được khoản tạm giữ hoa hồng cho nhân viên trong kỳ?",
        "Khi nào thì khoản tiền tạm giữ hoa hồng của sale được giải tỏa và chi trả lại?",
        "Các bước thực hiện giải tỏa tạm giữ hoa hồng cho nhân viên khi đã bổ sung đủ hồ sơ?",
        "Số tiền giải tỏa tạm giữ hoa hồng sẽ được cộng vào đâu để chi trả cho nhân viên?",
        "Có thể tạm giữ theo phần trăm hoặc nhập số tiền cố định trên hệ thống được không?",
        "Ai có quyền phê duyệt lệnh tạm giữ và giải tỏa tạm giữ hoa hồng trên phần mềm?",
        "Tại sao bấm giải tỏa tạm giữ hoa hồng mà hệ thống báo kỳ kế toán không hợp lệ?",
        "Làm sao để tra cứu danh sách toàn bộ nhân viên đang bị tạm giữ hoa hồng qua các kỳ?",
        "Bảng tổng hợp hoa hồng đã xác nhận thì có chỉnh sửa được số tiền tạm giữ không?",
      ],
      sampleAnswer:
        "💡 *Khoản tạm giữ hoa hồng chỉ được thêm/sửa khi Bảng tổng hợp hoa hồng tháng của nhân viên đang ở trạng thái Nháp.*\n• *Giải tỏa:* Khi nhân viên hoàn tất hồ sơ, kế toán thực hiện *Giải tỏa tạm giữ* để cộng trả số tiền vào đợt chi hoa hồng tiếp theo.\n👉 *Cách xử lý:* Vào màn hình *Quản lý tạm giữ hoa hồng* -> Chọn phiếu -> Bấm *Giải tỏa tạm giữ*.",
    },
    {
      topic: "Đợt chi & Lệnh chi Hoa hồng",
      questions: [
        "Điều kiện để tạo đợt chi và lệnh chi hoa hồng cho nhân viên trong tháng là gì?",
        "Vì sao một số nhân viên có hoa hồng trong tháng nhưng không xuất hiện khi tạo đợt chi?",
        "Tại sao hệ thống báo lỗi vượt quá số tiền còn lại phải trả khi tạo lệnh chi hoa hồng?",
        "Quy trình từ Bảng tổng hợp hoa hồng tháng sang Đợt chi và Lệnh chi ngân hàng như thế nào?",
        "Công thức tính số tiền thực lĩnh còn lại được phép đưa vào lệnh chi hoa hồng là gì?",
        "Có thể chia một bảng tổng hợp hoa hồng thành nhiều đợt chi khác nhau trong tháng không?",
        "Sau khi kế toán xác nhận đã thanh toán lệnh chi thì trạng thái hoa hồng của sale cập nhật ra sao?",
        "Làm thế nào để hủy hoặc sửa một lệnh chi hoa hồng khi chưa chuyển tiền ngân hàng?",
        "Kế toán muốn xuất danh sách lệnh chi hoa hồng ra file Excel để gửi ngân hàng thì thao tác ở đâu?",
        "Vì sao bấm tạo lệnh chi hoa hồng lại báo bảng tổng hợp chưa được xác nhận?",
      ],
      sampleAnswer:
        "💡 *Chỉ các dòng hoa hồng từ Bảng tổng hợp tháng đã ở trạng thái Đã xác nhận mới được đưa vào Đợt chi / Lệnh chi.*\n• *Ràng buộc:* Tổng số tiền chi không được vượt quá số thực lĩnh còn lại (sau khi trừ thuế TNCN, tạm giữ và khấu trừ tạm ứng).\n👉 *Cách xử lý:* Xác nhận Bảng tổng hợp tháng trước -> Tạo Đợt chi -> Xuất Lệnh chi.",
    },
    {
      topic: "Vòng đời Kỳ kế toán",
      questions: [
        "Sự khác nhau giữa Đóng mềm và Đóng cứng kỳ kế toán trên hệ thống là gì?",
        "Khi kỳ kế toán đang ở trạng thái Đóng mềm thì ai được phép tạo hoặc sửa chứng từ?",
        "Kỳ kế toán đã Đóng cứng rồi thì có mở lại để sửa số liệu hoa hồng được không?",
        "Vì sao kế toán viên không thể ghi sổ hóa đơn vào kỳ kế toán tháng trước?",
        "Quy trình đóng kỳ kế toán cuối tháng và mở kỳ kế toán mới đầu tháng gồm những bước nào?",
        "Làm thế nào để bổ sung phiếu điều chỉnh vào kỳ kế toán đang bị Đóng mềm?",
        "Ai có quyền thực hiện Mở lại kỳ kế toán từ trạng thái Đóng mềm về Đang mở?",
        "Nếu chưa tạo kỳ kế toán tháng mới thì các chứng từ phát sinh đầu tháng sẽ đi về đâu?",
        "Điều kiện tiên quyết trước khi thực hiện Đóng cứng kỳ kế toán là gì?",
        "Tại sao hệ thống chặn thao tác chỉnh sửa bảng tổng hợp hoa hồng của kỳ đã đóng?",
      ],
      sampleAnswer:
        "💡 *Kỳ kế toán có 3 trạng thái: Đang mở (hạch toán bình thường), Đóng mềm (chỉ Kế toán trưởng được điều chỉnh/mở lại), và Đóng cứng (khóa sổ hoàn toàn).*\n• *Lưu ý:* Khi kỳ đang Đóng mềm, nhân viên thường không thể tự ghi sổ mới vào kỳ đó.\n👉 *Cách xử lý:* Nhờ Kế toán trưởng *Mở lại kỳ* về trạng thái Đang mở để bổ sung chứng từ, sau đó đóng kỳ lại.",
    },
    {
      topic: "Giữ chỗ (Booking) & Hợp đồng Đặt cọc",
      questions: [
        "Một căn hộ trên bảng hàng cho phép tối đa bao nhiêu người đăng ký giữ chỗ cùng lúc?",
        "Khi hết thời gian đếm ngược giữ chỗ mà sale chưa chuyển cọc thì hệ thống xử lý thế nào?",
        "Quy trình từ lúc giữ chỗ căn hộ đến khi chuyển sang hợp đồng đặt cọc gồm những bước nào?",
        "Vì sao sale bấm giữ chỗ căn hộ lại báo đã đạt giới hạn số lượng giữ chỗ tối đa?",
        "Làm thế nào để xin gia hạn thêm thời gian giữ chỗ căn hộ khi khách đang chờ chuyển khoản?",
        "Khi người giữ chỗ ưu tiên số 1 hủy giữ chỗ thì quyền ưu tiên chuyển cho người số 2 ra sao?",
        "Cần đính kèm những giấy tờ hay hình ảnh gì khi gửi yêu cầu chuyển từ giữ chỗ sang đặt cọc?",
        "Phân biệt mã hợp đồng đặt cọc và số hợp đồng đặt cọc trên hệ thống?",
        "Tại sao phiếu giữ chỗ đã hết hạn nhưng căn hộ vẫn chưa tự động mở lại ngay lập tức?",
        "Admin dự án duyệt yêu cầu chuyển cọc của sale ở màn hình nào?",
      ],
      sampleAnswer:
        "💡 *Mỗi căn hộ chỉ cho phép số lượt giữ chỗ tối đa theo cấu hình dự án và có thời gian hiệu lực đếm ngược.*\n• *Quy tắc:* Khi hết hạn mà chưa chuyển cọc (và không có yêu cầu gia hạn chờ duyệt), hệ thống tự động giải phóng căn cho lượt ưu tiên kế tiếp.\n👉 *Cách xử lý:* Gửi yêu cầu *Chuyển cọc* kèm ảnh UNC thanh toán trước khi hết thời gian giữ chỗ.",
    },
    {
      topic: "Bảng hàng, CTV & Thông báo đẩy",
      questions: [
        "Vì sao sale không nhận được thông báo đẩy trên điện thoại khi phiếu giữ chỗ được duyệt?",
        "Làm thế nào để khắc phục lỗi không nhận được thông báo trên ứng dụng App Sale?",
        "Quy trình đăng ký và phê duyệt tài khoản Cộng tác viên (CTV) mới trên hệ thống?",
        "Màu sắc các ô căn hộ trên bảng hàng chỉ căn cao tầng thể hiện những trạng thái nào?",
        "Sự khác nhau giữa phân quyền của Sale nội bộ và Cộng tác viên khi xem bảng hàng dự án?",
        "Làm sao để so sánh thông tin nhiều căn hộ hoặc dự án cùng lúc trên cổng thông tin bán hàng?",
        "Khi có tin tức hoặc sự kiện mở bán mới được ghim thì thứ tự hiển thị ngoài trang chủ thế nào?",
        "Quy trình yêu cầu phiếu tính giá cho khách hàng trên ứng dụng bán hàng gồm mấy bước?",
        "Tại sao cộng tác viên đăng nhập vào app nhưng không xem được chính sách hoa hồng chi tiết?",
        "Cách cập nhật thông tin hồ sơ cá nhân và chứng chỉ môi giới của nhân viên trên ứng dụng?",
      ],
      sampleAnswer:
        "💡 *Thông báo được hệ thống gửi tự động ngay khi có cập nhật trạng thái phiếu hoặc sự kiện mới.*\n• *Nguyên nhân thường gặp:* Điện thoại chưa bật quyền thông báo cho ứng dụng hoặc phiên đăng nhập trên thiết bị đã hết hạn.\n👉 *Cách xử lý:* Kiểm tra mục *Thông báo* trong app, bật quyền thông báo ở Cài đặt máy và đăng nhập lại ứng dụng.",
    },
    {
      topic: "Báo cáo Công nợ, Quỹ & Phân bổ Hoa hồng Backoffice",
      questions: [
        "Cách tính và phân bổ hoa hồng cho khối Backoffice theo doanh thu về hoạt động như thế nào?",
        "Quy tắc tính hoa hồng cho Giám đốc dự án trên hệ thống dựa theo chỉ tiêu nào?",
        "Khi nào một giao dịch đủ điều kiện để đưa vào đợt phân bổ hoa hồng khối Backoffice?",
        "Làm thế nào để lập phiếu chi tiền từ Quản lý Quỹ cho các khoản thanh toán hoa hồng CTV?",
        "Báo cáo tổng hợp công nợ phải thu chủ đầu tư lấy số liệu từ những chứng từ nào?",
        "Quy trình ủy quyền nhận thay hoa hồng (chuyển hướng người thụ hưởng) cần điều kiện gì?",
        "Vì sao số tiền trên báo cáo quyết toán tạm ứng lệch với số dư tạm ứng của nhân viên?",
        "Cách cấu hình tỷ lệ hoa hồng theo bậc KPI hoàn thành chỉ tiêu tháng của phòng kinh doanh?",
        "Khi có thưởng nóng (imported bonus) từ chủ đầu tư thì kế toán nạp danh sách vào hệ thống ra sao?",
        "Email thông báo thu nhập hoa hồng hàng tháng được gửi cho nhân viên vào thời điểm nào?",
      ],
      sampleAnswer:
        "💡 *Hệ thống tổng hợp và phân bổ hoa hồng dựa trên doanh thu/chứng từ đã xác nhận trong kỳ kế toán mở.*\n• *Quy tắc:* Chỉ các giao dịch và bảng tổng hợp đã qua bước đối chiếu, xác nhận hợp lệ mới được đưa vào kỳ phân bổ và lên phiếu chi.\n👉 *Cách xử lý:* Kiểm tra trạng thái xác nhận của chứng từ gốc và kỳ kế toán trước khi xuất báo cáo hoặc tạo phiếu chi.",
    },
  ];

  for (const group of businessModules) {
    for (const q of group.questions) {
      cases.push({
        id: nextId(),
        category: "BUSINESS_QA",
        description: `[Thuần Business - ${group.topic}] ${q}`,
        input: {
          query: q,
          channelId: "C01BUSINESS",
        },
        expected_output: {
          intent: "SRS_QA",
          tech_mode: false,
          forbidden_terms_in_output: [
            ".py",
            ".ts",
            "apps/accounting",
            "create_from_pdcdt",
            "_attach_summary_line",
            "SalesInvoice",
            "MonthlySummaryStatus",
            "InvalidStateTransitionError",
            "```python",
          ],
          required_terms_in_output: ["💡"],
          sample_output_message: group.sampleAnswer,
        },
      });
    }
  }

  // =========================================================================
  // NHÓM 2: TECH_CHECK_CODE (65 Test Cases: TC-091 -> TC-155)
  // Chỉ khi user có từ khóa "check code", "xem code", "kiểm tra code", "hàm nào",
  // "file nào", "/code", "/dev", hoặc tên file .py/.ts.
  // =========================================================================
  const techQueries: Array<{ q: string; module: string; fileRef: string; fnRef: string }> = [
    {
      q: "check code giúp mình vì sao duyệt phiếu đối chiếu CĐT tháng 9 mà hóa đơn bán ra nhảy vào kỳ tháng 8",
      module: "Đối chiếu CĐT & Hóa đơn bán ra",
      fileRef: "apps/accounting/services/sales_invoice_service.py",
      fnRef: "create_from_pdcdt",
    },
    {
      q: "kiểm tra code xem hàm nào xác định kỳ kế toán khi sinh hóa đơn bán ra từ PDCDT",
      module: "Đối chiếu CĐT & Hóa đơn bán ra",
      fileRef: "apps/accounting/services/sales_invoice_service.py",
      fnRef: "_resolve_period",
    },
    {
      q: "xem code chỗ signal tự động tạo SalesInvoice khi InvestorReconciliationSheet chuyển sang CONFIRMED",
      module: "Đối chiếu CĐT & Hóa đơn bán ra",
      fileRef: "apps/accounting/signals.py",
      fnRef: "auto_create_sales_invoice_on_pdcdt_confirmed",
    },
    {
      q: "/code tìm nguyên nhân lỗi kỳ hoa hồng trong sales_invoice_service.py",
      module: "Đối chiếu CĐT & Hóa đơn bán ra",
      fileRef: "apps/accounting/services/sales_invoice_service.py",
      fnRef: "_resolve_period",
    },
    {
      q: "check code vì sao ghi sổ hoa hồng sàn liên kết bị lỗi Employee monthly summary must be DRAFT",
      module: "Hoa hồng Sàn liên kết",
      fileRef: "apps/accounting/services/linked_exchange_dept_commission_service.py",
      fnRef: "_attach_summary_line",
    },
    {
      q: "soi code hàm post_accounting của hoa hồng sàn liên kết kiểm tra điều kiện gì",
      module: "Hoa hồng Sàn liên kết",
      fileRef: "apps/accounting/services/linked_exchange_dept_commission_service.py",
      fnRef: "post_accounting",
    },
    {
      q: "trong code file nào xử lý reopen bảng tổng hợp hoa hồng tháng từ CONFIRMED về DRAFT?",
      module: "Hoa hồng Sàn liên kết",
      fileRef: "apps/accounting/services/monthly_summary_service.py",
      fnRef: "reopen",
    },
    {
      q: "check code hàm _attach_summary_line trong linked_exchange_dept_commission_service.py",
      module: "Hoa hồng Sàn liên kết",
      fileRef: "apps/accounting/services/linked_exchange_dept_commission_service.py",
      fnRef: "_attach_summary_line",
    },
    {
      q: "check code logic khấu trừ tạm ứng hoa hồng trong commission_advance_repayment_service.py",
      module: "Tạm ứng & Hoàn ứng",
      fileRef: "apps/accounting/services/commission_advance_repayment_service.py",
      fnRef: "deduct_from_monthly_summary",
    },
    {
      q: "xem code kiểm tra hạn mức tạm ứng hoa hồng nằm ở file nào?",
      module: "Tạm ứng & Hoàn ứng",
      fileRef: "apps/accounting/services/commission_advance_service.py",
      fnRef: "validate_advance_limit",
    },
    {
      q: "kiểm tra code phần tạm giữ hoa hồng trong commission_hold_service.py",
      module: "Tạm giữ Hoa hồng",
      fileRef: "apps/accounting/services/commission_hold_service.py",
      fnRef: "apply_hold",
    },
    {
      q: "check code điều kiện tạo đợt chi payout wave và lệnh chi payout batch",
      module: "Đợt chi & Lệnh chi",
      fileRef: "apps/accounting/services/payout_wave_service.py",
      fnRef: "create_wave",
    },
    {
      q: "xem code hàm validate_batch_items trong commission_payout_batch_service.py",
      module: "Đợt chi & Lệnh chi",
      fileRef: "apps/accounting/services/commission_payout_batch_service.py",
      fnRef: "validate_batch_items",
    },
    {
      q: "check code logic đóng mềm và đóng cứng kỳ kế toán trong accounting_period_service.py",
      module: "Kỳ kế toán",
      fileRef: "apps/accounting/services/accounting_period_service.py",
      fnRef: "transition_state",
    },
    {
      q: "kiểm tra code giới hạn giữ chỗ căn hộ trong unit_hold_service.py",
      module: "Giữ chỗ & Đặt cọc",
      fileRef: "apps/bookings/services/unit_hold_service.py",
      fnRef: "create_hold",
    },
    {
      q: "check code gửi push notification FCM trong apps/notifications/tasks.py",
      module: "Thông báo đẩy",
      fileRef: "apps/notifications/tasks.py",
      fnRef: "send_push_notification_task",
    },
    {
      q: "đọc code file apps/notifications/fcm_service.py xem xử lý multicast thế nào",
      module: "Thông báo đẩy",
      fileRef: "apps/notifications/fcm_service.py",
      fnRef: "send_multicast",
    },
  ];

  // Nhân rộng các biến thể câu lệnh kỹ thuật thực tế để đủ 65 cases
  const techPrefixes = [
    "check code: ",
    "xem code giúp mình: ",
    "kiểm tra code: ",
    "/code ",
  ];

  for (const pref of techPrefixes) {
    for (const item of techQueries) {
      if (cases.length >= 90 + 65) break;
      const fullQ = item.q.startsWith("/code") ? `${pref}${item.q.replace("/code ", "")}` : `${pref}${item.q}`;
      cases.push({
        id: nextId(),
        category: "TECH_CHECK_CODE",
        description: `[Tech Check Code - ${item.module}] ${fullQ}`,
        input: {
          query: fullQ,
          channelId: "C02TECHDEV",
        },
        expected_output: {
          intent: "CODE_DEV",
          tech_mode: true,
          needs_code_grounding: true,
          required_terms_in_output: ["💡 *Tóm tắt:*", "💻 *Logic Code:*", "👉 *Hướng xử lý:*", item.fileRef],
          sample_output_message:
            `💡 *Tóm tắt:* Phân tích kỹ thuật phân hệ ${item.module}.\n` +
            `💻 *Logic Code:*\n• *Vị trí:* \`${item.fileRef}\` — hàm \`${item.fnRef}\`\n` +
            `👉 *Hướng xử lý:* Kiểm tra trạng thái bản ghi và điều kiện trong hàm \`${item.fnRef}\`.`,
        },
      });
    }
  }

  // =========================================================================
  // NHÓM 3: FAST_PLANE_TASK (75 Test Cases: TC-156 -> TC-230)
  // Tạo task nhanh trên Plane từ 1 câu lệnh đơn hoặc từ thread,
  // kiểm tra tự động phân loại Bug/Task, Project, Module, Priority, Assignee.
  // =========================================================================
  const taskScenarios: Array<{
    q: string;
    proj: string;
    type: "bug" | "task";
    mod: string;
    assignee?: string;
    prio: string;
  }> = [
    {
      q: "tạo bug [CRM] Lỗi không lưu được số điện thoại khách hàng khi tạo lead mới giao @ducpm",
      proj: "CRM",
      type: "bug",
      mod: "CRM",
      assignee: "ducpm",
      prio: "high",
    },
    {
      q: "tạo task [CRM] Bổ sung bộ lọc nguồn khách hàng trên màn hình danh sách lead giao @phuongkt",
      proj: "CRM",
      type: "task",
      mod: "CRM",
      assignee: "phuongkt",
      prio: "medium",
    },
    {
      q: "tạo bug [MVLCTV] Lỗi ghi sổ hoa hồng sàn liên kết báo bảng tổng hợp không hợp lệ giao @phamhung",
      proj: "MVLCTV",
      type: "bug",
      mod: "Hoa hồng Sàn liên kết",
      assignee: "phamhung",
      prio: "high",
    },
    {
      q: "tạo task [MVLCTV] Thêm cột ngày đối chiếu trên danh sách hóa đơn bán ra giao @mainv",
      proj: "MVLCTV",
      type: "task",
      mod: "Đối chiếu CĐT",
      assignee: "mainv",
      prio: "medium",
    },
    {
      q: "tạo bug [MVL] Lỗi lệch số tiền khấu trừ tạm ứng hoa hồng kỳ tháng 9 giao @troy",
      proj: "MVL",
      type: "bug",
      mod: "Tạm ứng & Hoàn ứng",
      assignee: "troy",
      prio: "high",
    },
    {
      q: "tạo task [MVL] Xuất báo cáo tổng hợp tạm giữ hoa hồng ra file Excel giao @vunguyen",
      proj: "MVL",
      type: "task",
      mod: "Tạm giữ Hoa hồng",
      assignee: "vunguyen",
      prio: "medium",
    },
    {
      q: "tạo bug [MVLGO] Lỗi khẩn cấp status 500 khi bấm tạo đợt chi hoa hồng trên GoLive giao @ducpm",
      proj: "MVLGO",
      type: "bug",
      mod: "Đợt chi Hoa hồng",
      assignee: "ducpm",
      prio: "urgent",
    },
    {
      q: "tạo task [MVLGO] Cấu hình phân quyền đóng mềm kỳ kế toán cho kế toán trưởng giao @phuongkt",
      proj: "MVLGO",
      type: "task",
      mod: "Kỳ kế toán",
      assignee: "phuongkt",
      prio: "medium",
    },
    {
      q: "tạo bug [MAIVIETLAN] Lỗi khách hàng không nhận được thông báo đẩy FCM khi duyệt giữ chỗ giao @phamhung",
      proj: "MAIVIETLAN",
      type: "bug",
      mod: "Giữ chỗ",
      assignee: "phamhung",
      prio: "high",
    },
    {
      q: "tạo task [DEVOPS] Nâng cấp cấu hình worker CI/CD và tối ưu cache build Docker giao @ducpm",
      proj: "DEVOPS",
      type: "task",
      mod: "Hệ thống",
      assignee: "ducpm",
      prio: "medium",
    },
    {
      q: "tạo bug [DSTAX] Lỗi tính thuế TNCN bị làm tròn sai trên bảng kê hoa hồng CTV giao @mainv",
      proj: "DSTAX",
      type: "bug",
      mod: "Hoa hồng",
      assignee: "mainv",
      prio: "high",
    },
    {
      q: "tạo task [FETEAMS] Tối ưu giao diện bảng hàng chỉ căn cao tầng trên màn hình mobile giao @troy",
      proj: "FETEAMS",
      type: "task",
      mod: "Bảng hàng",
      assignee: "troy",
      prio: "medium",
    },
    {
      q: "tạo bug [GLINTECOWEBS] Lỗi hiển thị ảnh banner trang chủ bị vỡ trên Safari giao @vunguyen",
      proj: "GLINTECOWEBS",
      type: "bug",
      mod: "Hệ thống",
      assignee: "vunguyen",
      prio: "high",
    },
    {
      q: "log bug lỗi không chuyển cọc được từ phiếu giữ chỗ đã duyệt giao @phuongkt",
      proj: "MVLCTV",
      type: "bug",
      mod: "Giữ chỗ",
      assignee: "phuongkt",
      prio: "high",
    },
    {
      q: "/create-task [CRM] Thêm tính năng tự động gán sale phụ trách khi import danh sách khách hàng giao @ducpm",
      proj: "CRM",
      type: "task",
      mod: "CRM",
      assignee: "ducpm",
      prio: "medium",
    },
  ];

  const taskCommandVariants = [
    (s: string) => s,
    (s: string) => s.replace(/^tạo (bug|task)/i, "tạo nhanh $1"),
    (s: string) => s.replace(/^tạo (bug|task)/i, "lên $1 plane"),
    (s: string) => s.replace(/^tạo (bug|task)/i, "tạo giúp $1"),
    (s: string) => `/create_task ${s.replace(/^\/?(?:create-task|tạo bug|tạo task|log bug)\s*/i, "")}`,
  ];

  for (const variantFn of taskCommandVariants) {
    for (const sc of taskScenarios) {
      if (cases.length >= 155 + 75) break;
      const queryText = variantFn(sc.q);
      cases.push({
        id: nextId(),
        category: "FAST_PLANE_TASK",
        description: `[Fast Plane Task - ${sc.proj}] ${queryText}`,
        input: {
          query: queryText,
          channelId: "C03PLANETASK",
        },
        expected_output: {
          intent: "CREATE_TASK",
          tech_mode: false,
          expected_project: sc.proj,
          expected_task_type: sc.type,
          expected_module: sc.mod,
          expected_assignee: sc.assignee,
          expected_priority: sc.prio,
          required_terms_in_output: ["✅ *Đã tạo task Plane:*", sc.proj],
          sample_output_message:
            `✅ *Đã tạo task Plane:* <https://pm.glinteco.com/glinteco/projects/${sc.proj}/issues/123|[${sc.proj}-123] [${sc.type.toUpperCase()}] [${sc.mod}]>\n` +
            `• *Dự án:* ${sc.proj} | *Ưu tiên:* \`${sc.prio.toUpperCase()}\` | *Giao cho:* ${sc.assignee || "Chưa gán"}`,
        },
      });
    }
  }

  // =========================================================================
  // NHÓM 4: SCHEDULED_AND_ONDEMAND_AUDIT (40 Test Cases: TC-231 -> TC-270)
  // Kiểm tra Schedule Audit & On-Demand Audit SRS vs Code và format báo cáo.
  // =========================================================================
  const auditQueries = [
    "/audit",
    "/audit srs",
    "audit srs",
    "audit srs với code",
    "đối chiếu srs với code",
    "so sánh srs và code",
    "kiểm tra độ lệch srs",
    "báo cáo audit srs",
    "schedule audit srs",
    "rà soát srs với code",
    "/audit đối chiếu cđt",
    "/audit hóa đơn bán ra",
    "/audit sàn liên kết",
    "/audit tạm ứng",
    "/audit hoàn ứng",
    "/audit tạm giữ",
    "/audit đợt chi",
    "/audit lệnh chi",
    "/audit kỳ kế toán",
    "/audit giữ chỗ",
    "/audit đặt cọc",
    "/audit thông báo",
    "audit srs phân hệ đối chiếu cđt",
    "audit srs phân hệ hoa hồng sàn liên kết",
    "audit srs phân hệ tạm ứng hoa hồng",
    "audit srs phân hệ tạm giữ hoa hồng",
    "audit srs phân hệ đợt chi hoa hồng",
    "audit srs phân hệ kỳ kế toán",
    "audit srs phân hệ giữ chỗ đặt cọc",
    "audit srs phân hệ thông báo fcm",
    "đối chiếu srs với code phần hóa đơn bán ra",
    "đối chiếu srs với code phần bảng tổng hợp tháng",
    "đối chiếu srs với code phần khấu trừ tạm ứng",
    "đối chiếu srs với code phần giải tỏa tạm giữ",
    "đối chiếu srs với code phần đóng mềm kỳ kế toán",
    "đối chiếu srs với code phần lock căn giữ chỗ",
    "kiểm tra srs với code toàn bộ hệ thống",
    "kiểm tra độ lệch srs phân hệ kế toán hoa hồng",
    "so sánh srs với code luồng pdcdt",
    "audit code với srs",
  ];

  for (const aq of auditQueries) {
    cases.push({
      id: nextId(),
      category: "SCHEDULED_AND_ONDEMAND_AUDIT",
      description: `[SRS vs Code Audit] ${aq}`,
      input: {
        query: aq,
        channelId: "C04AUDIT",
      },
      expected_output: {
        intent: "AUDIT_SRS_CODE",
        tech_mode: false,
        required_terms_in_output: ["📋 *Báo cáo Audit SRS & Thực tế Hệ thống*", "• *Phạm vi:*"],
        sample_output_message:
          "📋 *Báo cáo Audit SRS & Thực tế Hệ thống*\n• *Phạm vi:* 8 phân hệ — ✅ *5 đồng bộ* | ⚠️ *3 điểm lệch*",
      },
    });
  }

  // =========================================================================
  // NHÓM 5: BA_USECASE_AND_QA_TESTCASE (30 Test Cases: TC-271 -> TC-300)
  // Sinh Use Case (BA) & Kịch bản kiểm thử UAT (QA) ngắn gọn + xuất Excel.
  // =========================================================================
  const baTopics = [
    "/usecase tạm ứng hoa hồng",
    "/usecase đối chiếu chủ đầu tư và hóa đơn bán ra",
    "/usecase ghi sổ hoa hồng sàn liên kết",
    "/usecase tạm giữ và giải tỏa hoa hồng",
    "/usecase đợt chi và lệnh chi hoa hồng",
    "/usecase đóng mở kỳ kế toán",
    "/usecase giữ chỗ và chuyển cọc căn hộ",
    "/usecase đăng ký và duyệt cộng tác viên",
    "/usecase yêu cầu phiếu tính giá",
    "/usecase phân bổ hoa hồng khối backoffice",
    "viết usecase quản lý hợp đồng đặt cọc",
    "sinh use case quy trình hoàn ứng hoa hồng",
    "tạo danh sách usecase bảng tổng hợp hoa hồng tháng",
    "viết use case quản lý phiếu chi quỹ",
    "bảng usecase quản lý thông báo đẩy",
  ];

  for (const bq of baTopics) {
    cases.push({
      id: nextId(),
      category: "BA_USECASE_AND_QA_TESTCASE",
      description: `[BA UseCase] ${bq}`,
      input: { query: bq, channelId: "C05BAQA" },
      expected_output: {
        intent: "BA",
        tech_mode: false,
        required_terms_in_output: ["💡 *Tóm tắt nghiệp vụ:*", "| Mã UC |"],
        sample_output_message:
          "💡 *Tóm tắt nghiệp vụ:* Quy trình quản lý và phê duyệt theo chuẩn SRS.\n\n| Mã UC | Nhóm | Tên use case | Tác nhân chính | BR liên quan | Ghi chú |",
      },
    });
  }

  const qaTopics = [
    "/testcase tạm ứng hoa hồng",
    "/testcase đối chiếu chủ đầu tư và hóa đơn bán ra",
    "/testcase ghi sổ hoa hồng sàn liên kết",
    "/testcase tạm giữ và giải tỏa hoa hồng",
    "/testcase đợt chi và lệnh chi hoa hồng",
    "/testcase đóng mở kỳ kế toán",
    "/testcase giữ chỗ và chuyển cọc căn hộ",
    "/testcase đăng ký và duyệt cộng tác viên",
    "/testcase yêu cầu phiếu tính giá",
    "/testcase phân bổ hoa hồng khối backoffice",
    "viết testcase quản lý hợp đồng đặt cọc",
    "sinh test case quy trình hoàn ứng hoa hồng",
    "tạo kịch bản uat bảng tổng hợp hoa hồng tháng",
    "kịch bản kiểm thử quản lý phiếu chi quỹ",
    "bảng testcase quản lý thông báo đẩy",
  ];

  for (const qq of qaTopics) {
    cases.push({
      id: nextId(),
      category: "BA_USECASE_AND_QA_TESTCASE",
      description: `[QA TestCase] ${qq}`,
      input: { query: qq, channelId: "C05BAQA" },
      expected_output: {
        intent: "QA",
        tech_mode: false,
        required_terms_in_output: ["💡 *Phạm vi kiểm thử:*", "| Sub Module |"],
        sample_output_message:
          "💡 *Phạm vi kiểm thử:* Kiểm thử luồng chính, ngoại lệ, phân quyền và giá trị biên.\n\n| Sub Module | Mô tả | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |",
      },
    });
  }

  // =========================================================================
  // NHÓM 6: PROJECT_SEARCH_AND_GUARDRAILS (30 Test Cases: TC-301 -> TC-330)
  // Tra cứu bug Plane, cấu hình project, và kiểm thử bộ lọc Guardrail khử Tech leak.
  // =========================================================================
  const searchAndProjectQueries: Array<{ q: string; intent: string }> = [
    { q: "/bugs lệch kỳ hoa hồng", intent: "SEARCH_PLANE" },
    { q: "/bugs không ghi sổ được sàn liên kết", intent: "SEARCH_PLANE" },
    { q: "/tasks tạm ứng hoa hồng", intent: "SEARCH_PLANE" },
    { q: "tìm bug xuất excel báo cáo công nợ", intent: "SEARCH_PLANE" },
    { q: "tra cứu bug giữ chỗ căn hộ", intent: "SEARCH_PLANE" },
    { q: "tiến độ plane dự án CRM", intent: "SEARCH_PLANE" },
    { q: "danh sách bug đợt chi hoa hồng", intent: "SEARCH_PLANE" },
    { q: "/projects", intent: "LIST_PROJECTS" },
    { q: "danh sách project trên plane", intent: "LIST_PROJECTS" },
    { q: "xem các project", intent: "LIST_PROJECTS" },
    { q: "/set-project CRM", intent: "SET_PROJECT" },
    { q: "set project MVLCTV", intent: "SET_PROJECT" },
    { q: "đổi project MVLGO", intent: "SET_PROJECT" },
    { q: "chọn project MAIVIETLAN", intent: "SET_PROJECT" },
    { q: "gán project mặc định DEVOPS", intent: "SET_PROJECT" },
  ];

  for (const sp of searchAndProjectQueries) {
    cases.push({
      id: nextId(),
      category: "PROJECT_SEARCH_AND_GUARDRAILS",
      description: `[Plane Search & Project Config] ${sp.q}`,
      input: { query: sp.q, channelId: "C06CONFIG" },
      expected_output: {
        intent: sp.intent,
        tech_mode: false,
        sample_output_message: `✅ Đã xử lý lệnh ${sp.intent} ngắn gọn, chính xác.`,
      },
    });
  }

  // 15 Guardrail Sanitizer Test Cases (TC-316 -> TC-330):
  // Đưa vào câu trả lời giả lập bị rò rỉ tên file .py, hàm, code block khi allowTech=false
  // và xác minh bộ lọc sanitizeAgentResponse làm sạch 100%!
  const dirtyOutputs = [
    "### 📌 1. Tóm tắt\nDo hàm `_attach_summary_line` trong file `backend/apps/accounting/services/linked_exchange_dept_commission_service.py:L742-L760` kiểm tra trạng thái DRAFT.",
    "Không tìm thấy kết quả từ tool search_codebase. Tuy nhiên, theo `apps/accounting/services/sales_invoice_service.py`, hàm `create_from_pdcdt` dùng `reconciliation_date`.",
    "Gọi tool: search_codebase({\"repo\":\"backend\",\"query\":\"SalesInvoice\"})\nKhi `InvestorReconciliationSheet` ở trạng thái CONFIRMED, hệ thống tạo `SalesInvoice`.",
    "Lỗi `InvalidStateTransitionError` xảy ra tại `MonthlyBeneficiaryCommissionSummary` khi chưa ở trạng thái DRAFT.\n```python\nif summary.status != MonthlySummaryStatus.DRAFT:\n    raise InvalidStateTransitionError()\n```",
    "File `apps/accounting/services/commission_advance_repayment_service.py` kiểm tra phiếu tạm ứng ở trạng thái PAID trước khi khấu trừ.",
    "Trong `apps/accounting/services/commission_hold_service.py:L825`, hàm `_resolve_period` xác định `accounting_period`.",
    "Hệ thống báo `ValidationError` tại `apps/accounting/services/payout_wave_service.py` khi trạng thái APPROVED chưa chuyển sang PAID.",
    "### 🔍 2. Phân tích nguyên nhân\nTại `apps/accounting/services/accounting_period_service.py`, kỳ đang ở `SOFT_CLOSED` hoặc `HARD_CLOSED`.",
    "[Code: backend/apps/bookings/services/unit_hold_service.py] quy định giới hạn giữ chỗ tối đa.",
    "Hàm `post_accounting` trong `linked_exchange_dept_commission_service.py` gọi `_attach_summary_line`.",
    "Kiểm tra `apps/notifications/tasks.py` và `apps/notifications/fcm_service.py` khi gửi thông báo.",
    "Khi `MonthlySummaryStatus.CONFIRMED` đã khóa, bạn cần mở lại về `MonthlySummaryStatus.DRAFT`.",
    "(File: src/api/schema.ts) trả về lỗi `ValidationError` khi thiếu trường dữ liệu.",
    "### 💡 3. Hướng dẫn xử lý\n1. Mở `MonthlyBeneficiaryCommissionSummary`.\n2. Chuyển từ trạng thái CONFIRMED về trạng thái DRAFT.",
    "read_code_file({\"repo\":\"backend\",\"filePath\":\"apps/accounting/signals.py\"})\nKết quả: Hóa đơn bán ra được tạo tự động.",
    "Chào bạn, với tư cách là Trợ lý AI Cấp cao & Chuyên gia Phân tích Nghiệp vụ của dự án MaiVietLand, tôi xin phản hồi về yêu cầu kiểm tra logic nghiệp vụ liên quan đến task **MVL-3819** dựa trên hệ thống tài liệu SRS hiện hành như sau:\n💡 *Công thức tính HHQL tháng của Hải Phòng không khác các chi nhánh khác.*\n**Khuyến nghị:** Vui lòng cung cấp nội dung mô tả của task MVL-3819.\n[Tài liệu: appsale-v1/features/3.1-cms-portal/brd.md | Đề mục: Changelog]",
  ];

  for (let i = 0; i < dirtyOutputs.length; i++) {
    cases.push({
      id: nextId(),
      category: "PROJECT_SEARCH_AND_GUARDRAILS",
      description: `[Business Mode Guardrail Sanitizer #${i + 1}] Khử lời chào dài dòng & rò rỉ code/file/hàm`,
      input: {
        query: "Vì sao hệ thống báo lỗi này vậy bạn?",
        rawModelOutputToSanitize: dirtyOutputs[i],
      },
      expected_output: {
        intent: "SRS_QA",
        tech_mode: false,
        forbidden_terms_in_output: [
          "Chào bạn",
          "với tư cách là",
          "Khuyến nghị: Vui lòng cung cấp",
          "Đề mục: Changelog",
          ".py",
          ".ts",
          "apps/accounting",
          "_attach_summary_line",
          "create_from_pdcdt",
          "SalesInvoice",
          "InvestorReconciliationSheet",
          "MonthlyBeneficiaryCommissionSummary",
          "InvalidStateTransitionError",
          "```python",
          "Gọi tool:",
        ],
        sample_output_message: "💡 Đã làm sạch hoàn toàn đoạn giới thiệu dài dòng và thuật ngữ kỹ thuật.",
      },
    });
  }

  // Bổ sung 4 kịch bản thực tế kiểm tra trực tiếp link/mã Task Plane (MVL-3819, MVLGO-55, MVLGO-211)
  cases.push(
    {
      id: nextId(),
      category: "BUSINESS_QA",
      description: "[Plane Task Link Resolution - MVL-3819] Kiểm tra logic task HHQL Hải Phòng từ link Plane",
      input: {
        query: "Kiểm tra logic của task này. Chi tiết nghiệp vụ pm.glinteco.com/glinteco/browse/MVL-3819",
        channelId: "C01BUSINESS",
      },
      expected_output: {
        intent: "SRS_QA",
        tech_mode: false,
        forbidden_terms_in_output: ["Chào bạn", "với tư cách là", ".py", "_resolve_managers_for_department"],
        required_terms_in_output: ["💡", "Hải Phòng", "Giám đốc khối"],
        sample_output_message:
          "💡 *Công thức tính Hoa hồng quản lý (HHQL) tháng của Hải Phòng KHÔNG khác các chi nhánh còn lại — nguyên nhân lệch số liệu là do các Khối tại Hải Phòng đang bỏ trống trường Giám đốc khối và dữ liệu tách 2 mã chi nhánh (CN000000006 & CN000000010).*\n• *Quy tắc:* Người nhận TPKD/GĐKD phụ thuộc cấu hình nguồn quản lý kinh doanh của Chi nhánh (Chuẩn / Phẳng / Lai).\n👉 *Cách xử lý:* Cập nhật Giám đốc khối cho các khối thuộc Hải Phòng hoặc chuyển cấu hình nguồn quản lý chi nhánh sang Phẳng/Lai.",
      },
    },
    {
      id: nextId(),
      category: "BUSINESS_QA",
      description: "[HHQL Chi nhánh Hải Phòng - MVL-3819] Câu hỏi trực tiếp về sự khác biệt HHQL Hải Phòng",
      input: {
        query: "Vì sao HHQL của Hải Phòng có cách tính khác với các chi nhánh còn lại (MVL-3819)?",
        channelId: "C01BUSINESS",
      },
      expected_output: {
        intent: "SRS_QA",
        tech_mode: false,
        forbidden_terms_in_output: ["Chào bạn", "với tư cách là", ".py", "management_commission_service"],
        required_terms_in_output: ["💡", "Hải Phòng"],
        sample_output_message:
          "💡 *Công thức tính HHQL tháng của Hải Phòng dùng chung toàn hệ thống; chênh lệch là do Khối kinh doanh tại Hải Phòng chưa gán Giám đốc khối khiến phần HHQL của GĐKD bị bỏ qua.*\n👉 *Cách xử lý:* Gán Giám đốc khối hoặc đổi cấu hình nguồn quản lý chi nhánh Hải Phòng sang Phẳng/Lai.",
      },
    },
    {
      id: nextId(),
      category: "TECH_CHECK_CODE",
      description: "[Tech Check Code - MVL-3819] Kiểm tra code xử lý HHQL Hải Phòng",
      input: {
        query: "check code Kiểm tra logic của task này. Chi tiết nghiệp vụ pm.glinteco.com/glinteco/browse/MVL-3819",
        channelId: "C02TECHDEV",
      },
      expected_output: {
        intent: "CODE_DEV",
        tech_mode: true,
        needs_code_grounding: true,
        required_terms_in_output: [
          "💡 *Tóm tắt:*",
          "💻 *Logic Code:*",
          "apps/accounting/services/management_commission_service.py",
        ],
        sample_output_message:
          "💡 *Tóm tắt:* HHQL tháng xác định TPKD/GĐKD qua cấu hình nguồn quản lý chi nhánh.\n💻 *Logic Code:*\n• *Vị trí:* `apps/accounting/services/management_commission_service.py:L228-L295` — hàm `_resolve_managers_for_department`\n👉 *Hướng xử lý:* Cấu hình `sales_director_source` hoặc gán `division.director`.",
      },
    },
    {
      id: nextId(),
      category: "BUSINESS_QA",
      description: "[HRM & HHQL - MVLGO-55 / MVLGO-211] Chỉ tiêu ngày công chuẩn và lịch sử công tác cuối kỳ",
      input: {
        query: "Quy tắc tính ngày công tiêu chuẩn và lịch sử công tác trong bảng công tháng MVLGO-55 MVLGO-211 như thế nào?",
        channelId: "C01BUSINESS",
      },
      expected_output: {
        intent: "SRS_QA",
        tech_mode: false,
        forbidden_terms_in_output: ["Chào bạn", "với tư cách là", ".py", "timesheet_service"],
        required_terms_in_output: ["💡"],
        sample_output_message:
          "💡 *Bảng công tháng tổng hợp ngày công thực tế, nghỉ phép/công tác đã duyệt và ngày lễ so với Công chuẩn tháng; lịch sử công tác tự động ghi nhận phòng ban theo thời điểm hiệu lực.*\n👉 *Cách xử lý:* Kiểm tra các đơn từ và ngày hiệu lực trên Quyết định điều động/bổ nhiệm trước khi chốt kỳ.",
      },
    }
  );

  return cases;
}

async function runAllTests() {
  const testCases = build330TestCases();
  const outDir = path.join(__dirname, "..", "tests");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const jsonPath = path.join(outDir, "testcases_300_io.json");
  fs.writeFileSync(jsonPath, JSON.stringify(testCases, null, 2), "utf-8");
  console.log(`✅ Đã xuất bộ dữ liệu kiểm thử gồm ${testCases.length} Input-Output Test Cases tại: ${jsonPath}`);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  const dummyEnv: any = {
    KV: { get: async () => null, put: async () => {} },
    PLANE_DEFAULT_PROJECT_ID: "e92f7ba8-0db9-487f-a21c-13712d226eb8",
  };

  for (const tc of testCases) {
    try {
      const actualIntent = classifyIntent(tc.input.query);
      const actualTechMode = isTechRequested(tc.input.query);

      if (actualIntent !== tc.expected_output.intent) {
        throw new Error(
          `Intent mismatch: expected '${tc.expected_output.intent}', got '${actualIntent}' for query="${tc.input.query}"`
        );
      }

      if (actualTechMode !== tc.expected_output.tech_mode) {
        throw new Error(
          `techMode mismatch: expected '${tc.expected_output.tech_mode}', got '${actualTechMode}' for query="${tc.input.query}"`
        );
      }

      // Kiểm tra chi tiết theo từng Category
      if (tc.category === "BUSINESS_QA") {
        const grounding = await getSmartCodeContext(tc.input.query, undefined, { allowTech: false });
        // Trong chế độ Business, ngay cả grounding cũng không được chứa code snippet ```python
        if (grounding.includes("```python")) {
          throw new Error(`Business grounding leaked raw python code block for query="${tc.input.query}"`);
        }

        const sanitized = sanitizeAgentResponse(tc.expected_output.sample_output_message, false);
        for (const forbidden of tc.expected_output.forbidden_terms_in_output || []) {
          if (sanitized.includes(forbidden)) {
            throw new Error(`Forbidden tech term '${forbidden}' found in business output`);
          }
        }
        const blocks = createAnswerBlocks(sanitized);
        if (!blocks || blocks.length < 2) {
          throw new Error(`Expected Slack answer blocks to be generated`);
        }
      } else if (tc.category === "TECH_CHECK_CODE") {
        const techContext = await getSmartCodeContext(tc.input.query, undefined, { allowTech: true });
        if (!techContext || !techContext.includes("[File:")) {
          throw new Error(`Expected tech code context with [File: ...] for query="${tc.input.query}"`);
        }
      } else if (tc.category === "FAST_PLANE_TASK") {
        const extracted = extractBugHeuristically([], "1700000000.000100", tc.input.query);
        const resolvedProj = await resolvePlaneProject({
          text: tc.input.query,
          channelId: tc.input.channelId,
          env: dummyEnv,
        });

        if (tc.expected_output.expected_project && resolvedProj.identifier !== tc.expected_output.expected_project) {
          throw new Error(
            `Project mismatch: expected '${tc.expected_output.expected_project}', got '${resolvedProj.identifier}'`
          );
        }
        if (tc.expected_output.expected_task_type && extracted.taskType !== tc.expected_output.expected_task_type) {
          throw new Error(
            `TaskType mismatch: expected '${tc.expected_output.expected_task_type}', got '${extracted.taskType}'`
          );
        }
        if (tc.expected_output.expected_assignee && extracted.explicitAssignee !== tc.expected_output.expected_assignee) {
          throw new Error(
            `Assignee mismatch: expected '${tc.expected_output.expected_assignee}', got '${extracted.explicitAssignee}'`
          );
        }
        const card = createTaskCreatedCard({
          id: "issue-uuid-12345678",
          displayId: `${resolvedProj.identifier}-101`,
          name: extracted.taskName,
          url: `https://pm.glinteco.com/glinteco/projects/${resolvedProj.id}/issues/issue-uuid-12345678`,
          assigneeName: extracted.explicitAssignee || "Chưa gán",
          priority: extracted.severity,
          projectName: resolvedProj.identifier,
        });
        const cardText = JSON.stringify(card);
        if (!cardText.includes("Đã tạo task Plane") || !cardText.includes(resolvedProj.identifier)) {
          throw new Error(`Task card missing expected concise fields`);
        }
      } else if (tc.category === "SCHEDULED_AND_ONDEMAND_AUDIT") {
        const report = await runSrsCodeAudit({ query: tc.input.query });
        if (report.totalChecked < 1 || !report.markdownSummary.includes("📋 *Báo cáo Audit SRS & Thực tế Hệ thống*")) {
          throw new Error(`Invalid audit report output for query="${tc.input.query}"`);
        }
      } else if (tc.category === "PROJECT_SEARCH_AND_GUARDRAILS" && tc.input.rawModelOutputToSanitize) {
        const cleaned = sanitizeAgentResponse(tc.input.rawModelOutputToSanitize, false);
        for (const forbidden of tc.expected_output.forbidden_terms_in_output || []) {
          if (cleaned.toLowerCase().includes(forbidden.toLowerCase())) {
            throw new Error(
              `Sanitizer failed to strip '${forbidden}' from raw output. Result was: "${cleaned}"`
            );
          }
        }
      }

      passed++;
    } catch (err: any) {
      failed++;
      failures.push(`[${tc.id}] ${tc.description} -> ${err.message}`);
    }
  }

  console.log(`\n=============================================================`);
  console.log(`📊 KẾT QUẢ CHẠY BỘ KIỂM THỬ INPUT-OUTPUT (TYPESCRIPT ENGINE)`);
  console.log(`• Tổng số Test Cases: ${testCases.length} (Yêu cầu tối thiểu: 300)`);
  console.log(`• Passed: ${passed}/${testCases.length} (${((passed / testCases.length) * 100).toFixed(2)}%)`);
  console.log(`• Failed: ${failed}`);
  console.log(`=============================================================\n`);

  if (failures.length > 0) {
    console.error("❌ Chi tiết các case lỗi:\n" + failures.slice(0, 20).join("\n"));
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
