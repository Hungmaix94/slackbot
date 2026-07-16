# ClickUp Task, Change Request & Bug Templates (MVL Web Project)

Tài liệu này cung cấp các template chuẩn để tạo Task (Feature), Change Request (CR), và Bug Report trên ClickUp. Việc chuẩn hóa thông tin giúp đội ngũ Dev, QA và PO phối hợp hiệu quả, giảm thiểu hiểu lầm và đẩy nhanh tốc độ release.

---

## 📌 Phân loại Task & Cách đặt Tiêu đề

Khi tạo công việc trên ClickUp, hãy đặt tiêu đề theo cấu trúc chuẩn:
* **Change Request (CR):** `[CR] [Module/Phân hệ] - <Nội dung thay đổi>`
  * *Ví dụ:* `[CR] [Phiếu thu] - Đổi hiển thị "ngày lập phiếu" thành "ngày thu tiền"`
* **Bug Report:** `[BUG] [Module/Phân hệ] - <Mô tả lỗi ngắn gọn>`
  * *Ví dụ:* `[BUG] [Tạm giữ Sale] - Lỗi crash giao diện khi bấm nút lưu không có dữ liệu`

---

## 1. Template cho Feature Task (Tính năng mới)

```markdown
# 🚀 FEATURE: [Tên Tính Năng]

> [!NOTE]  
> **Thông tin chung:**  
> - **Phân hệ/Module:** [Ví dụ: 20.8 Quản lý bảng chia hoa hồng]  
> - **Người yêu cầu (PO/BA/PM):** [Tên]  
> - **Độ ưu tiên:** [Low / Medium / High / Urgent]  
> - **Tài liệu Mockup/Figma:** [Link Figma hoặc file HTML mockup]  
> - **API Specs/Swagger:** [Link Swagger / Postman hoặc file schema liên quan]

---

### 📝 1. Mô tả Yêu Cầu (Requirements)
[Mô tả chi tiết luồng nghiệp vụ và cách tính năng này hoạt động từ góc nhìn người dùng.]

- **User Story:** Là một [Vai trò người dùng], tôi muốn [Hành động] để có thể [Kết quả/Giá trị mang lại].
- **Mô tả chi tiết:**
  1. ...
  2. ...

### 🎨 2. Giao Diện & UI/UX (UI Specification)
[Mô tả các thành phần UI, layout, CSS, tương tác và các trạng thái của màn hình.]

- **Mockup/Thiết kế:** [Chèn ảnh chụp màn hình hoặc mô tả vị trí trong Figma]
- **Chi tiết các Component:**
  - **Component A:** [Ví dụ: Dropdown chọn Dự án, hỗ trợ search, clearable]
  - **Component B:** [Ví dụ: Bảng hiển thị danh sách, căn phải cột số tiền, phân trang server-side]
- **Hiệu ứng/Micro-animations:** [Ví dụ: Hover effect, Loading skeletons khi fetch API, smooth transitions]

### ⚙️ 3. Đặc Tả Kỹ Thuật & API (Technical Specs)
[Cung cấp thông tin kỹ thuật để Developer bắt tay vào code nhanh nhất.]

- **API Endpoints:**
  - `GET /api/v1/your-resource/` (Fetch list - hỗ trợ search, filter, page)
  - `POST /api/v1/your-resource/` (Create new)
- **Data Types & Fields:**
  - `id` (number): ID tự tăng
  - `amount` (number): Số tiền (VND)
- **Zod Schema / Validation Rules:**
  - `amount` must be >= 0
  - Cảnh báo hoặc validation lỗi khi vượt quá hạn mức.

### ✅ 4. Điều Kiện Nghiệm Thu (Acceptance Criteria)
[QA/QC và Dev sẽ dựa vào mục này để test và kiểm thử chất lượng tính năng.]

- [ ] Hiển thị đúng dữ liệu danh sách khi load trang.
- [ ] Tìm kiếm theo Mã căn/Sản phẩm hoạt động chính xác với cơ chế debounce 500ms.
- [ ] Bấm nút "Lưu" gửi payload đúng định dạng lên API và hiển thị thông báo thành công.
- [ ] Giao diện responsive trên cả Mobile và Desktop.
```

---

## 2. Template cho Change Request - CR (Yêu cầu thay đổi)

```markdown
# 🔄 CHANGE REQUEST: [Nội dung thay đổi]

> [!IMPORTANT]  
> **Thông tin thay đổi:**  
> - **Phân hệ bị ảnh hưởng:** [Ví dụ: Quản lý Phiếu thu]  
> - **Yêu cầu bởi:** [Khách hàng / PO / Ý kiến từ Demo]  
> - **Mức độ ảnh hưởng:** [Thấp - UI/UX / Trung bình - Đổi logic / Cao - Thay đổi Database]

---

### 🔍 1. Hiện Trạng (Current Behavior)
[Mô tả giao diện hoặc logic hiện tại đang hoạt động như thế nào và tại sao cần thay đổi.]
- *Ví dụ:* Hiện tại màn hình chi tiết phiếu thu đang hiển thị nhãn là "Ngày lập phiếu" và validate bắt buộc nhập với thông báo "Vui lòng chọn ngày lập phiếu".

### 💡 2. Yêu Cầu Thay Đổi (Proposed Changes)
[Mô tả chi tiết những gì cần sửa đổi, xóa bỏ hoặc thêm mới.]
- **Thay đổi UI:**
  - Đổi nhãn `"Ngày lập phiếu"` thành `"Ngày thu tiền"`.
- **Thay đổi Logic/Validation:**
  - Cập nhật Zod validation message cho trường `receipt_date` thành `"Vui lòng chọn ngày thu tiền"`.
  - Hỗ trợ số tiền âm trong phân bổ hóa đơn điều chỉnh giảm (cấn trừ).
- **Ảnh hưởng hệ thống:**
  - Cần rà soát các màn hình liên quan: Tạo mới, Chỉnh sửa, Chi tiết, và các file schema validation tương ứng.

### 🎨 3. Mockup/Hình Ảnh Minh Họa (Visual Proof)
[Đính kèm hình ảnh mô tả vị trí hoặc trạng thái mới cần đạt được.]
- [Link ảnh hoặc chèn trực tiếp ảnh minh họa]

### ✅ 4. Kiểm Thứ Nghiệm Thu (Acceptance Criteria)
- [ ] Nhãn hiển thị đã được thay đổi chính xác trên toàn bộ các màn hình liên quan (Create/Edit/Detail).
- [ ] Khi để trống trường ngày, thông báo lỗi validation hiển thị đúng nội dung mới.
- [ ] Không làm phát sinh lỗi hồi quy (regression) ở các phần tính toán tiền tệ khác.
```

---

## 3. Template cho Bug Report (Báo cáo lỗi)

```markdown
# 🐛 BUG: [Mô tả lỗi ngắn gọn]

> [!WARNING]  
> **Thông tin lỗi:**  
> - **Môi trường bị lỗi:** [Local / Staging / Production]  
> - **Thiết bị & Trình duyệt:** [Ví dụ: Chrome v120 - macOS / Mobile Safari]  
> - **Phân hệ:** [Ví dụ: Tạm ứng hoa hồng]  
> - **Mức độ nghiêm trọng:** [Blocker - Không thể chạy tiếp / Critical - Lỗi chức năng chính / Major / Minor]

---

### 🔄 1. Các Bước Tái Hiện Lỗi (Steps to Reproduce)
[Ghi rõ từng bước chi tiết để Dev/QA có thể tự chạy lại và thấy lỗi.]
1. Truy cập vào phân hệ **Tạm ứng hoa hồng**.
2. Bấm vào nút **Tạo đề xuất tạm ứng**.
3. Chọn giao dịch cọc chưa được duyệt và bấm **Lưu** mà không điền số tiền.
4. Quan sát màn hình.

### ❌ 2. Kết Quả Thực Tế (Actual Behavior)
[Mô tả lỗi đang xảy ra: crash màn hình, dữ liệu sai lệch, không phản hồi...]
- Màn hình bị crash trắng (White Screen of Death) hoặc hiển thị lỗi `Cannot read properties of undefined (reading 'split_amount')`.

### 🟢 3. Kết Quả Mong Muốn (Expected Behavior)
[Mô tả hệ thống nên xử lý thế nào trong trường hợp này.]
- Hệ thống không được crash.
- Hiển thị thông báo validation màu đỏ ngay dưới ô nhập số tiền: `"Vui lòng nhập số tiền tạm ứng hợp lệ"`.

### 📸 4. Hình Ảnh / Video Minh Họa (Evidence)
[Đính kèm screenshot hoặc video quay lại thao tác bị lỗi - RẤT QUAN TRỌNG để debug nhanh.]
- [Chèn ảnh chụp màn hình console log lỗi hoặc video mô tả lỗi]

### 🛠️ 5. Gợi Ý Sửa Lỗi (Dành cho Developer - optional)
- Kiểm tra file `CommissionAdvanceForm.tsx` tại hàm `onSubmit` hoặc phần validate schema xem đã bắt lỗi `undefined` chưa.
- Kiểm tra dữ liệu trả về từ endpoint `/api/sales/deals/` khi deal ở trạng thái `DEPOSIT`.
```

