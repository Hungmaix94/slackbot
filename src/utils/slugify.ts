/**
 * Chuyển đổi chuỗi tiếng Việt thành slug viết thường không dấu phục vụ đặt tên file.
 */
export function slugifyVietnamese(text: string): string {
  if (!text) return "export";

  // Bỏ các tiền tố prompt phổ biến
  let cleaned = text
    .replace(/^[/]?(usecase|testcase)\s*/i, "")
    .replace(/cho yêu cầu sau:\s*/i, "")
    .replace(/[*_#]/g, "")
    .trim();

  // Bỏ dấu tiếng Việt
  cleaned = cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

  // Chỉ giữ chữ cái, số, khoảng trắng và gạch ngang
  cleaned = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "export";
}
