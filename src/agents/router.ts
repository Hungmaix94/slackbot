export type AgentIntent =
  | "SRS_QA"
  | "BA"
  | "QA"
  | "CREATE_TASK"
  | "SEARCH_PLANE"
  | "SEARCH_CLICKUP"
  | "CODE_DEV"
  | "AUDIT_SRS_CODE"
  | "LIST_PROJECTS"
  | "SET_PROJECT";

/**
 * Kiểm tra xem người dùng có CHỦ ĐỘNG yêu cầu xem thông tin kỹ thuật / kiểm tra code hay không.
 * Quy tắc: Mặc định trả lời thuần Business thân thiện. Chỉ bật chế độ Tech khi người dùng
 * nhắc rõ từ khóa kỹ thuật như "check code", "xem code", "hàm nào", "file nào", "/code"...
 */
export function isTechRequested(query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase().trim();

  // 1. Lệnh slash kỹ thuật trực tiếp
  if (q.startsWith("/code") || q.startsWith("/dev") || q.startsWith("/api")) {
    return true;
  }

  // 2. Đường dẫn file code cụ thể (.py, .ts, .tsx, .js) được người dùng chỉ định trong câu hỏi (bỏ qua URL)
  const qWithoutUrls = q.replace(/https?:\/\/\S+|\b(?:pm\.glinteco\.com|app\.plane\.so)\/\S+/gi, "");
  if (/\b[\w\/\.\-]+\.(?:py|ts|tsx|js|sql)\b/i.test(qWithoutUrls)) {
    return true;
  }

  // 3. Các cụm từ chủ động yêu cầu kiểm tra code / kỹ thuật
  const explicitTechKeywords = [
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
  ];

  return explicitTechKeywords.some((kw) => q.includes(kw));
}

/**
 * Kiểm tra xem câu hỏi có cần nạp ngầm logic từ Codebase (Under-the-hood Grounding)
 * để đảm bảo câu trả lời nghiệp vụ chính xác 100% với thực tế hệ thống hay không.
 */
export function needsCodeContextUnderTheHood(query: string): boolean {
  if (!query) return false;
  if (isTechRequested(query)) return true;

  const q = query.toLowerCase().trim();
  const groundingTriggers = [
    "tại sao",
    "tai sao",
    "vì sao",
    "vi sao",
    "nguyên nhân",
    "nguyen nhan",
    "lý do",
    "ly do",
    "báo lỗi",
    "bao loi",
    "bị lỗi",
    "bi loi",
    "gặp lỗi",
    "gap loi",
    "lỗi này",
    "loi nay",
    "lỗi gì",
    "loi gi",
    "không được",
    "khong duoc",
    "không thể",
    "khong the",
    "bị chặn",
    "bi chan",
    "nhảy kỳ",
    "nhay ky",
    "lệch kỳ",
    "lech ky",
    "sai lệch",
    "sai lech",
    "sinh ra",
    "gen ra",
    "tự động tạo",
    "đối chiếu",
    "doi chieu",
    "hóa đơn bán ra",
    "hoa don ban ra",
    "sàn liên kết",
    "san lien ket",
    "ghi sổ",
    "ghi so",
    "bảng tổng hợp",
    "bang tong hop",
    "tạm ứng",
    "tam ung",
    "hoàn ứng",
    "hoan ung",
    "tạm giữ",
    "tam giu",
    "đợt chi",
    "dot chi",
    "lệnh chi",
    "lenh chi",
    "kỳ kế toán",
    "ky ke toan",
    "đóng kỳ",
    "mở kỳ",
    "mở lại",
    "reopen",
    "must be draft",
    "validation_error",
    "invalid_state_transition",
    "status 400",
    "status 500",
  ];

  if (
    groundingTriggers.some((kw) => q.includes(kw)) ||
    /\{.*"error".*\}/i.test(query) ||
    /\{.*"detail".*\}/i.test(query)
  ) {
    return true;
  }

  return false;
}

export function classifyIntent(query: string): AgentIntent {
  const q = query.toLowerCase().trim();

  // 0. Quản lý / cấu hình Project Plane
  if (
    q.startsWith("/set-project") ||
    q.startsWith("/set_project") ||
    q.startsWith("set project") ||
    q.startsWith("đổi project") ||
    q.startsWith("chọn project") ||
    q.includes("gán project mặc định") ||
    q.includes("đặt project mặc định")
  ) {
    return "SET_PROJECT";
  }

  if (
    q === "/projects" ||
    q === "/project" ||
    q === "project" ||
    q === "projects" ||
    q.startsWith("/projects") ||
    q.startsWith("/list-projects") ||
    q.includes("danh sách project") ||
    q.includes("danh sách dự án") ||
    q.includes("xem các project") ||
    q.includes("các project trên plane") ||
    q.includes("project list")
  ) {
    return "LIST_PROJECTS";
  }

  // 1. Audit / Đối chiếu tài liệu SRS với Codebase thực tế
  if (
    q.startsWith("/audit") ||
    q.startsWith("audit ") ||
    q === "audit" ||
    q.includes("audit srs") ||
    q.includes("đối chiếu srs với code") ||
    q.includes("doi chieu srs voi code") ||
    q.includes("đối chiếu srs và code") ||
    q.includes("so sánh srs với code") ||
    q.includes("so sánh srs và code") ||
    q.includes("kiểm tra độ lệch srs") ||
    q.includes("kiem tra do lech srs") ||
    q.includes("kiểm tra srs với code") ||
    q.includes("ráo soát srs với code") ||
    q.includes("rà soát srs với code") ||
    q.includes("báo cáo audit srs") ||
    q.includes("schedule audit") ||
    q.includes("audit code với srs")
  ) {
    return "AUDIT_SRS_CODE";
  }

  // 2. Tạo task hoặc báo bug nhanh trên Plane
  if (
    /^(?:\/?(?:create[-_]task|plane[-_]task|clickup[-_]task|task|bug)\b|(?:tạo|tao|lên|len|log|báo|bao)\s+(?:nhanh\s+|giúp\s+|hộ\s+)?(?:task|bug|lỗi|issue)\b)/i.test(
      q
    ) ||
    q.startsWith("/create_task") ||
    q.startsWith("/create-task") ||
    q.startsWith("/plane-task") ||
    q.startsWith("/clickup-task") ||
    q.startsWith("/task ") ||
    q.startsWith("/bug ") ||
    q.startsWith("tạo task") ||
    q.startsWith("tao task") ||
    q.startsWith("tạo bug") ||
    q.startsWith("tao bug") ||
    q.startsWith("log bug") ||
    q.startsWith("báo bug") ||
    q.startsWith("báo lỗi plane") ||
    q.includes("tạo task plane") ||
    q.includes("tạo plane task") ||
    q.includes("tạo bug plane") ||
    q.includes("báo bug plane") ||
    q.includes("tạo task clickup") ||
    q.includes("tạo clickup task") ||
    q.includes("tạo task nhanh") ||
    q.includes("lên task plane") ||
    q.includes("tạo giúp task") ||
    q.includes("tạo hộ task") ||
    q.includes("tạo giúp bug") ||
    q.includes("tạo hộ bug") ||
    q.includes("tạo bug này") ||
    q.includes("tạo task này") ||
    q.includes("tạo task:") ||
    q.includes("tạo bug:") ||
    q.includes("tạo task ") ||
    q.includes("tạo bug ") ||
    q.includes("log bug ")
  ) {
    return "CREATE_TASK";
  }

  // 3. Tra cứu bug / task trên Plane
  if (
    q.startsWith("/bugs") ||
    q.startsWith("/tasks") ||
    q.startsWith("/plane-bugs") ||
    q.startsWith("/plane-tasks") ||
    q.includes("tìm bug") ||
    q.includes("tìm task") ||
    q.includes("tiến độ plane") ||
    q.includes("tiến độ clickup") ||
    q.includes("tra cứu bug") ||
    q.includes("tra cứu task") ||
    q.includes("danh sách bug")
  ) {
    return "SEARCH_PLANE";
  }

  // 4. Phân tích nghiệp vụ / Use Case (BA)
  if (
    q.startsWith("/usecase") ||
    q.includes("viết usecase") ||
    q.includes("viết use case") ||
    q.includes("sinh usecase") ||
    q.includes("sinh use case") ||
    q.includes("tạo usecase") ||
    q.includes("tạo use case") ||
    q.includes("danh sách usecase") ||
    q.includes("danh sách use case") ||
    q.includes("bảng usecase") ||
    q.includes("bảng use case")
  ) {
    return "BA";
  }

  // 5. Thiết kế kiểm thử / UAT (QA)
  if (
    q.startsWith("/testcase") ||
    q.includes("viết testcase") ||
    q.includes("viết test case") ||
    q.includes("sinh testcase") ||
    q.includes("sinh test case") ||
    q.includes("tạo testcase") ||
    q.includes("tạo test case") ||
    q.includes("kịch bản uat") ||
    q.includes("kịch bản kiểm thử") ||
    q.includes("bảng testcase") ||
    q.includes("bảng test case")
  ) {
    return "QA";
  }

  // 6. Tra cứu kỹ thuật / Codebase CHỈ KHI người dùng chủ động yêu cầu (ví dụ: "check code", "xem code", "/code"...)
  if (isTechRequested(query)) {
    return "CODE_DEV";
  }

  // Mặc định: Trợ lý Q&A Nghiệp vụ thân thiện (kết hợp cả SRS & hiểu biết từ Code nhưng trả lời thuần Business)
  return "SRS_QA";
}
