# ClickUp Task & Bug Templates (MVL Web Project)

Tài liệu cung cấp template chuẩn, ngắn gọn để tạo Task và Bug trên ClickUp. Đảm bảo thông tin rõ ràng, tập trung vào nghiệp vụ và có Definition of Done (DOD) cụ thể.

---

## 1. Template cho Task (Feature / Change Request)

```markdown
# 🚀 [Feature/CR]: [Tên Tính Năng / Thay Đổi]

**Context:**
- **Phân hệ:** [Tên phân hệ]
- **Tài liệu/Figma:** [Link tham khảo]
- **Người yêu cầu:** [Tên]

**Yêu cầu (Requirements):**
- [Mô tả ngắn gọn mục tiêu của task: Ai cần gì, để làm gì?]
- [Gạch đầu dòng các thay đổi/tính năng cụ thể]

**✅ DOD (Definition of Done) / Acceptance Criteria:**
- [ ] Code hoàn thiện, không phá vỡ luồng hiện tại (No regression).
- [ ] Đáp ứng đúng UI/UX theo Figma.
- [ ] Pass các điều kiện nghiệp vụ:
  - [ ] [Điều kiện 1]
  - [ ] [Điều kiện 2]
```

---

## 2. Template cho Bug Report

```markdown
# 🐛 [BUG]: [Mô tả lỗi ngắn gọn]

**Context:**
- **Môi trường:** [Local / Staging / Production]
- **Thiết bị/OS:** [Ví dụ: Chrome macOS / iOS Safari]

**Mô tả Lỗi:**
- **Các bước tái hiện (Steps):**
  1. [Bước 1]
  2. [Bước 2]
- **Thực tế (Actual):** [Lỗi xảy ra là gì]
- **Mong đợi (Expected):** [Hệ thống phải hoạt động ra sao]
- **Evidence:** [Đính kèm ảnh/video nếu có]

**✅ DOD (Definition of Done):**
- [ ] Lỗi được khắc phục hoàn toàn trên môi trường chỉ định.
- [ ] Không sinh side-effect ở các tính năng liên quan.
```
