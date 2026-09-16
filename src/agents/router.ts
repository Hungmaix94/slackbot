export type AgentIntent =
  | "SRS_QA"
  | "BA"
  | "QA"
  | "CREATE_TASK"
  | "SEARCH_PLANE"
  | "SEARCH_CLICKUP"
  | "CODE_DEV"
  | "LIST_PROJECTS"
  | "SET_PROJECT";

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
    q.includes("các project") ||
    q.includes("project list")
  ) {
    return "LIST_PROJECTS";
  }

  // 1. Tạo task hoặc báo bug trên Plane / ClickUp
  if (
    q.startsWith("/create_task") ||
    q.startsWith("/create-task") ||
    q.startsWith("/plane-task") ||
    q.startsWith("/clickup-task") ||
    q.includes("tạo task plane") ||
    q.includes("tạo plane task") ||
    q.includes("tạo bug plane") ||
    q.includes("báo lỗi plane") ||
    q.includes("báo bug plane") ||
    q.includes("tạo task clickup") ||
    q.includes("tạo clickup task") ||
    q.includes("tạo task click up") ||
    q.includes("tạo bug") ||
    q.includes("tạo task") ||
    q.includes("báo lỗi clickup")
  ) {
    return "CREATE_TASK";
  }

  // 2. Tra cứu bug / task trên Plane
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
    q.includes("tra cứu task")
  ) {
    return "SEARCH_PLANE";
  }

  // 3. Tra cứu kỹ thuật / Codebase / API / Model
  if (
    q.startsWith("/code") ||
    q.startsWith("/dev") ||
    q.startsWith("/api") ||
    q.includes("mã nguồn") ||
    q.includes("codebase") ||
    q.includes("trong code") ||
    q.includes("file") ||
    q.includes("hàm") ||
    q.includes("service") ||
    q.includes("model") ||
    q.includes("serializer") ||
    q.includes("viewset") ||
    q.includes("api flow") ||
    q.includes("endpoint") ||
    q.includes("django") ||
    q.includes("schema.ts") ||
    q.includes("đối chiếu code") ||
    q.includes("khớp với code") ||
    q.includes("code xử lý sao") ||
    q.includes("code thực tế") ||
    q.includes("kiểm tra vì sao") ||
    q.includes("tại sao") ||
    q.includes("vì sao") ||
    q.includes("lý do vì sao") ||
    q.includes("nguyên nhân") ||
    q.includes("gen ra") ||
    q.includes("sinh ra") ||
    q.includes("sai lệch") ||
    q.includes("bị nhảy") ||
    q.includes("tự động tạo") ||
    q.includes("lỗi logic")
  ) {
    return "CODE_DEV";
  }

  // 4. Phân tích nghiệp vụ / Use Case
  if (
    q.startsWith("/usecase") ||
    q.includes("usecase") ||
    q.includes("use case") ||
    q.includes("đặc tả nghiệp vụ") ||
    q.includes("luồng nghiệp vụ")
  ) {
    return "BA";
  }

  // 5. Thiết kế kiểm thử / UAT
  if (
    q.startsWith("/testcase") ||
    q.includes("testcase") ||
    q.includes("test case") ||
    q.includes("kịch bản") ||
    q.includes("kiểm thử") ||
    q.includes("uat")
  ) {
    return "QA";
  }

  // Mặc định: Trợ lý Q&A SRS
  return "SRS_QA";
}
