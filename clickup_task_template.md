# ClickUp Task, Change Request & Bug Templates (MVL Web Project)

Tài liệu này cung cấp các template chuẩn để tạo Task (Feature), Change Request (CR), và Bug Report trên ClickUp. Việc chuẩn hóa thông tin giúp đội ngũ Dev, QA và PO phối hợp hiệu quả, tập trung vào nghiệp vụ, tránh đi quá sâu vào kỹ thuật dễ gây hiểu sai.

---

## 📌 Phân loại Task & Cách đặt Tiêu đề

* **Feature:** `[Feature] [Phân hệ] - <Tên tính năng>`
* **Change Request:** `[CR] [Phân hệ] - <Nội dung thay đổi>`
* **Bug Report:** `[BUG] [Phân hệ] - <Mô tả lỗi>`

---

## 1. Template cho Feature Task (Tính năng mới)

```markdown
# 🚀 FEATURE: [Tên Tính Năng]

> [!NOTE]  
> - **Phân hệ:** [Tên phân hệ]  
> - **Người yêu cầu:** [Tên]  
> - **Tài liệu tham khảo:** [Link Figma / BRD / API Docs]

### 📝 1. Mô tả Yêu Cầu (Requirements)
- **User Story:** Là một [Vai trò], tôi muốn [Hành động] để [Mục đích].
- **Mô tả nghiệp vụ:**
  - [Liệt kê các quy tắc, luồng hoạt động chính của tính năng]
  - [Các điều kiện ràng buộc về mặt nghiệp vụ]

### 🎨 2. Giao Diện (UI/UX)
- **Thiết kế:** [Chèn ảnh hoặc link Figma]
- **Yêu cầu UI/UX bổ sung:** [Ghi chú nếu có yêu cầu đặc biệt về hiển thị, responsive...]

### ✅ 3. Điều Kiện Nghiệm Thu (Acceptance Criteria)
- [ ] [Điều kiện 1 - vd: Hiển thị đúng danh sách dữ liệu]
- [ ] [Điều kiện 2 - vd: Thao tác lưu dữ liệu thành công]
- [ ] [Điều kiện 3 - vd: Bắt lỗi và thông báo khi nhập sai định dạng]
```

---

## 2. Template cho Change Request - CR (Yêu cầu thay đổi)

```markdown
# 🔄 CHANGE REQUEST: [Nội dung thay đổi]

> [!IMPORTANT]  
> - **Phân hệ:** [Tên phân hệ]  
> - **Yêu cầu bởi:** [Khách hàng / PO]  
> - **Mức độ ảnh hưởng:** [Thấp / Trung bình / Cao]

### 🔍 1. Hiện Trạng (Current Behavior)
- [Mô tả tính năng hiện tại đang hoạt động như thế nào và tại sao cần thay đổi.]

### 💡 2. Yêu Cầu Thay Đổi (Proposed Changes)
- [Liệt kê rõ ràng những điểm cần thay đổi về luồng nghiệp vụ hoặc giao diện.]
- [Ghi chú các màn hình/chức năng liên quan có thể bị ảnh hưởng để Dev/QA chú ý.]

### ✅ 3. Điều Kiện Nghiệm Thu (Acceptance Criteria)
- [ ] [Điều kiện nghiệm thu sau khi thay đổi]
- [ ] [Đảm bảo không phát sinh lỗi ở các luồng liên quan (Regression)]
```

---

## 3. Template cho Bug Report (Báo cáo lỗi)

```markdown
# 🐛 BUG: [Mô tả lỗi ngắn gọn]

> [!WARNING]  
> - **Môi trường:** [Local / Staging / Production]  
> - **Thiết bị & Trình duyệt:** [Ví dụ: Chrome v120 - macOS / Mobile Safari]  
> - **Mức độ:** [Blocker / Critical / Major / Minor]

### 🔄 1. Các Bước Tái Hiện Lỗi (Steps to Reproduce)
1. [Bước 1: Truy cập vào màn hình nào...]
2. [Bước 2: Thực hiện thao tác gì...]
3. [Bước 3: Quan sát hiện tượng...]

### ❌ 2. Kết Quả Thực Tế (Actual Behavior)
- [Mô tả lỗi đang xảy ra (vd: báo lỗi hệ thống, lưu không thành công, sai số liệu...)]

### 🟢 3. Kết Quả Mong Muốn (Expected Behavior)
- [Mô tả hệ thống nên hoạt động như thế nào nếu không có lỗi.]

### 📸 4. Hình Ảnh / Video (Evidence)
- [Chèn ảnh chụp màn hình hoặc video quay lại quá trình bị lỗi để dễ dàng kiểm chứng.]
```
