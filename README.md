# 🤖 MVL Assistant Slackbot (Railway + Google Antigravity SDK Edition)

> Trợ lý AI Nghiệp vụ & Điều phối Công việc dự án **MaiVietLand (MVL ERP & App Sale)** — chạy trên **Python 3.12 + FastAPI + Slack Bolt + Google Antigravity SDK (`google-antigravity`)** trên hạ tầng **Railway Docker**.

---

## 🌟 4 Trụ cột Kiến trúc Cốt lõi

### 1. Hỏi đáp Nghiệp vụ Thân thiện (`Business-First`) vs Kiểm tra Kỹ thuật (`"check code"`)
- **Mặc định Thuần Business (`allowTech = false`):**
  - Agent sử dụng **Google Antigravity SDK (`google-antigravity`)** (`antigravity_engine.py`) kết hợp cơ sở tri thức FTS5 **48,953 chunks** (`srs_fts.db` — SRS + Backend Docs/Issues + Code ERP/AppSale).
  - Phản hồi **Zero-Intro** (bắt đầu ngay ở dòng 1 bằng `💡`), hoàn toàn bằng **ngôn ngữ nghiệp vụ thân thiện, gần gũi** cho Kế toán, Sale, Admin, BA, PO.
  - **Guardrail Sanitizer (`sanitize_agent_response`)**: Tự động lọc bỏ 100% tên file (`.py`, `.ts`), tên hàm/class (`_attach_summary_line`, `create_from_pdcdt`, `SalesInvoice`...) và dịch toàn bộ trạng thái hệ thống sang tiếng Việt (*Nháp*, *Đã xác nhận*, *Đã duyệt*, *Đã thanh toán*).
- **Chế độ Kỹ thuật (`"check code"`, `"xem code"`, `"hàm nào"`, `"file nào"`, `"/code"`):**
  - Chỉ kích hoạt khi người dùng chủ động yêu cầu kiểm tra code (`is_tech_requested(query) == True`).
  - Trích dẫn chính xác đường dẫn file, khoảng dòng code, tên hàm/class và điều kiện xử lý.

### 2. Template Phản hồi Siêu Ngắn Gọn, Đúng Ý Chính
- **Hỏi đáp Nghiệp vụ (3–6 dòng):**
  ```markdown
  💡 *[Câu trả lời trực diện / Nguyên nhân cốt lõi trong 1-2 câu thân thiện]*
  • *[Quy tắc / Chi tiết]:* [Giải thích ngắn gọn]
  👉 *Cách xử lý:* [Các bước thao tác ngắn gọn trên màn hình]
  ```
- **Kiểm tra Code (`"check code"`):**
  ```markdown
  💡 *Tóm tắt:* [Nguyên nhân chính 1-2 câu]
  💻 *Logic Code:* `[file_path:Lxx-Lyy]` (`hàm/class`) — [Điều kiện xử lý]
  👉 *Hướng xử lý:* [Cách thao tác hoặc hướng sửa code]
  ```
- **Thẻ Tạo Task Plane:**
  ```markdown
  ✅ *Đã tạo task Plane:* <[URL]|[MÃ-123] [BUG/TASK] [Phân hệ] - Tiêu đề>
  • *Dự án:* `MÃ` | *Ưu tiên:* `HIGH` | *Giao cho:* @user
  ```

### 3. Tạo Task Nhanh Trên Plane (1 Câu Lệnh Đơn hoặc Từ Thread) & Giải mã Link Task
- Tự động tra cứu trực tiếp mã task hoặc link Plane trong câu hỏi (`pm.glinteco.com/glinteco/browse/MVL-3819`, `MVLGO-55`, `MVLCTV-940`...) trước khi tìm kiếm RAG.
- Tạo trực tiếp chỉ bằng 1 tin nhắn (không bắt buộc phải nằm trong thread):
  - `@bot tạo bug [CRM] Lỗi không lưu được SĐT khách hàng giao @ducpm`
  - `@bot tạo task [MVLCTV] Bổ sung cột ngày đối chiếu trên hóa đơn bán ra giao @phuongkt`
  - `/create-task [MVLGO] Lỗi 500 khi tạo đợt chi hoa hồng`
- Tự động phân giải **9 dự án Plane** (`MVLCTV`, `MVL`, `MVLGO`, `MAIVIETLAN`, `CRM`, `DEVOPS`, `DSTAX`, `FETEAMS`, `GLINTECOWEBS`), gán đúng thành viên và cảnh báo task trùng lặp.

### 4. Schedule Audit SRS với Code & Báo cáo Tự động
- **Lập lịch tự động (Scheduled Background Task):**
  - FastAPI Background Scheduler (`periodic_audit_scheduler` trong `server.py`).
- **Kích hoạt tức thì (On-demand):**
  - Gõ `/audit`, `@bot audit srs`, `@bot đối chiếu srs với code` hoặc gọi API `GET /audit/report`, `POST /audit/run`.

---

## 🧪 Bộ Kiểm Thử 335 Input-Output Test Cases (Min 300+ Test Cases)

Bộ dữ liệu kiểm thử chuẩn nằm tại [`tests/testcases_300_io.json`](tests/testcases_300_io.json) gồm **335 kịch bản Input-Output** chia làm 6 nhóm:
1. **`BUSINESS_QA` (93 cases):** Hỏi đáp nghiệp vụ & xử lý lỗi thuần Business + giải mã link Plane `MVL-3819` (kiểm tra Zero-Intro & 0% rò rỉ thuật ngữ code).
2. **`TECH_CHECK_CODE` (67 cases):** Yêu cầu `"check code"`, `"xem code"`, `"/code"` (kiểm tra trích dẫn chính xác file & hàm).
3. **`FAST_PLANE_TASK` (75 cases):** Tạo nhanh Bug/Task trên Plane qua 9 dự án & ánh xạ người phụ trách.
4. **`SCHEDULED_AND_ONDEMAND_AUDIT` (40 cases):** Kiểm toán độ lệch SRS vs Code toàn hệ thống và theo từng phân hệ.
5. **`BA_USECASE_AND_QA_TESTCASE` (30 cases):** Sinh bảng Use Case (BA) & Kịch bản UAT (QA) xuất Excel.
6. **`PROJECT_SEARCH_AND_GUARDRAILS` (30 cases):** Tra cứu bug Plane, cấu hình project mặc định và kiểm thử bộ lọc Guardrail khử rò rỉ code.

### Chạy kiểm thử tự động:
```bash
# Kiểm thử Python Engine + Google Antigravity SDK + 48,953-chunk SRS/Code FTS Database (335/335 cases)
./.venv/bin/python3 tests/test_suite_300.py
```
