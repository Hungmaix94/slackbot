import os
import re
import json
import asyncio
from slack_bolt.async_app import AsyncApp
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler
import google.generativeai as genai
from dotenv import load_dotenv

# Tải cấu hình từ file .env
load_dotenv()

# Cấu hình API Key của Google Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# Đường dẫn thư mục tài liệu SRS
SRS_DIR = os.environ.get("SRS_DIR", "/home/phamhung/Work/MVL/web/docs/srs/docs")

def search_srs_files(query: str) -> str:
    """
    Tìm kiếm các tệp tài liệu SRS chứa từ khóa hoặc có tên chứa từ khóa.
    """
    query = query.lower()
    matches = []
    
    if not os.path.exists(SRS_DIR):
        return f"Lỗi: Thư mục tài liệu SRS '{SRS_DIR}' không tồn tại."
        
    for root, dirs, files in os.walk(SRS_DIR):
        for file in files:
            if file.endswith(".md"):
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, SRS_DIR)
                
                # Kiểm tra tên tệp
                if query in file.lower():
                    matches.append(rel_path)
                    continue
                    
                # Kiểm tra nội dung tệp
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        if query in f.read().lower():
                            matches.append(rel_path)
                except Exception:
                    pass
    
    if not matches:
        return f"Không tìm thấy tài liệu SRS nào khớp với từ khóa '{query}'."
        
    return "Các tài liệu tìm thấy:\n" + "\n".join(f"- {path}" for path in matches[:15])

def read_srs_file(filepath: str) -> str:
    """
    Đọc toàn bộ nội dung của một tệp tài liệu SRS cụ thể.
    """
    # Đảm bảo đường dẫn tuyệt đối an toàn và không thoát khỏi thư mục SRS_DIR
    safe_path = os.path.abspath(os.path.join(SRS_DIR, filepath))
    if not safe_path.startswith(os.path.abspath(SRS_DIR)):
        return "Lỗi: Không được phép truy cập tệp tin ngoài thư mục SRS."
        
    if not os.path.exists(safe_path):
        return f"Lỗi: Tệp tin '{filepath}' không tồn tại."
        
    try:
        with open(safe_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Lỗi khi đọc tệp tin: {str(e)}"

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

def parse_markdown_table(text):
    lines = text.split("\n")
    table_rows = []
    in_table = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            if in_table:
                break
            continue
            
        # Split by '|' and strip spaces
        parts = [p.strip() for p in stripped.split("|")[1:-1]]
        
        # Skip the separator row (like |:---|:---|)
        if parts and all(re.match(r"^:?-+:?$", p) for p in parts):
            in_table = True
            continue
            
        if not any(parts):
            continue
            
        table_rows.append(parts)
        in_table = True
        
    return table_rows

def create_excel_from_rows(rows, filepath):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Kịch bản UAT"
    
    # Hiển thị đường lưới trong Excel
    ws.views.sheetView[0].showGridLines = True
    
    # Cấu hình Font và Fill cho Header giống hệt file mẫu Kịch bản UAT.xlsx
    header_font = Font(name="Times New Roman", size=14, bold=True, color="000000")
    header_fill = PatternFill(start_color="93C47D", end_color="93C47D", fill_type="solid") # Màu xanh lá pastel của file mẫu
    data_font = Font(name="Times New Roman", size=14, bold=False, color="000000")
    
    thin_border = Border(
        left=Side(style='thin', color='000000'),
        right=Side(style='thin', color='000000'),
        top=Side(style='thin', color='000000'),
        bottom=Side(style='thin', color='000000')
    )
    
    # Định nghĩa Header chuẩn của UAT
    headers = [
        'Sub Module', 'ID', 'Mô tả', 'Bước thực hiện', 
        'Dữ liệu test', 'Kết quả mong đợi', 'Trạng thái(Web)', 
        'Kết quả thực tế', 'Ghi chú'
    ]
    
    # Ghi Header
    for c_idx, h_text in enumerate(headers, 1):
        cell = ws.cell(row=1, column=c_idx, value=h_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border
        
    # Ghi dữ liệu UAT
    # Bỏ qua dòng tiêu đề của Markdown (rows[0])
    data_rows = rows[1:]
    
    for r_idx, row in enumerate(data_rows, 2): # Hàng 2 trong Excel trở đi
        while len(row) < 5:
            row.append("")
            
        md_sub_module = row[0]
        md_mota = row[1]
        md_steps = row[2]
        md_expected = row[3]
        md_test_data = row[4]
        
        # Ánh xạ 9 cột Excel
        excel_row_vals = [
            md_sub_module,                             # Col A: Sub Module
            f'=IF(G{r_idx}="","",COUNTA($G$2:G{r_idx}))', # Col B: ID (Công thức Excel)
            md_mota,                                   # Col C: Mô tả
            md_steps,                                  # Col D: Bước thực hiện
            md_test_data,                              # Col E: Dữ liệu test
            md_expected,                               # Col F: Kết quả mong đợi
            "Pass",                                    # Col G: Trạng thái(Web)
            "",                                        # Col H: Kết quả thực tế
            ""                                         # Col I: Ghi chú
        ]
        
        for c_idx, val in enumerate(excel_row_vals, 1):
            cleaned_val = str(val).replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
            cell = ws.cell(row=r_idx, column=c_idx, value=cleaned_val)
            cell.font = data_font
            
            # Căn lề các cột giống file mẫu (vertical="center")
            if c_idx in [1, 2, 5, 7]: # Sub Module, ID, Dữ liệu test, Trạng thái(Web) căn giữa
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                
            cell.border = thin_border
            
    # Tự động căn chỉnh độ rộng cột (bỏ qua độ dài công thức ID)
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            if cell.value:
                val_str = "1" if str(cell.value).startswith("=") else str(cell.value)
                cell_lines = val_str.split('\n')
                for line in cell_lines:
                    if len(line) > max_len:
                        max_len = len(line)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)
        
    wb.save(filepath)

# Cấu hình chỉ dẫn hệ thống cùng định dạng tóm gọn & chi tiết
system_instruction = """
Bạn là một AI Agent đóng vai trò Senior BA và QA Lead, chịu trách nhiệm phân tích và trả lời các câu hỏi về tài liệu SRS của dự án MaiVietLand.

QUY TẮC PHÂN TÍCH & TRẢ LỜI:
1. CHỈ TRẢ LỜI TRONG SRS: Mọi câu trả lời của bạn phải dựa HOÀN TOÀN và CHỈ DỰA trên thông tin tìm thấy từ các file tài liệu SRS. Hãy sử dụng công cụ `search_srs_files` để tìm kiếm và `read_srs_file` để đọc nội dung các file tài liệu. Không tự ý suy đoán ngoài tài liệu.
2. NÓI "KHÔNG BIẾT" NẾU THIẾU THÔNG TIN: Nếu không tìm thấy thông tin trong tài liệu SRS, trả lời: "Thông tin này hiện chưa được đề cập hoặc chưa có trong tài liệu SRS của dự án."
3. LUÔN TRÍCH DẪN NGUỒN: Cuối mỗi câu trả lời hoặc ý chính, nêu rõ tên file tài liệu làm nguồn tham chiếu (ví dụ: "[Nguồn: features/booking/test-spec.md]").

ĐỘ DÀI & ĐỊNH DẠNG CÂU TRẢ LỜI BẮT BUỘC:
- MẶC ĐỊNH (TÓM GỌN): Trả lời cực kỳ ngắn gọn, súc tích (dưới 15 dòng). Chỉ nêu các ý chính cốt lõi nhất dưới dạng gạch đầu dòng ngắn.
- CHI TIẾT (CHỈ KHI YÊU CẦU): Chỉ khi người dùng có yêu cầu rõ ràng như "chi tiết", "đầy đủ", "đặc tả chi tiết", bạn mới được trả lời dài và chi tiết theo cấu trúc phân tích BA/QA sau:

### 📌 Tóm tắt câu trả lời
[Câu trả lời ngắn gọn trong 1-2 câu]

### 🔍 Phân tích Nghiệp vụ
* **Luồng xử lý:** [Mô tả các bước thực hiện nghiệp vụ liên quan]
* **Quy tắc nghiệp vụ:** [Mô tả các công thức tính toán, điều kiện kích hoạt hoặc logic ràng buộc]

### 🧪 Kịch bản Kiểm thử & Điều kiện biên (Theo tiêu chuẩn qa-test-planner)
BẮT BUỘC phải sinh kịch bản kiểm thử đầy đủ, chi tiết, KHÔNG ĐƯỢC làm sơ sài. Hãy tạo ít nhất **15 đến 20 kịch bản test** (hàng dữ liệu trong bảng) bao phủ đầy đủ các nhóm sau:
- **Kịch bản Tích cực (Positive):** Luồng xử lý thành công thông thường (Tạo nháp, gửi duyệt, kế toán duyệt, kế toán chi tiền mark-paid, hoàn ứng tự động khi confirm).
- **Kịch bản Tiêu cực (Negative):** Nhập sai định dạng, dữ liệu trống, vượt hạn mức, trùng lặp người nhận, duyệt/chi khi sai trạng thái.
- **Kịch bản Phân quyền (Permissions):** User không có quyền kế toán cố gắng thêm/duyệt/chi/hủy phiếu.
- **Kịch bản UI/UX & Danh sách:** Hiển thị danh sách, kiểm tra căn lề text/number, hover thay đổi màu nền row, phân trang, lọc theo trạng thái/kỳ lương/chi nhánh, xuất file excel.
- **Kịch bản Giá trị biên & Hoàn ứng nâng cao (Boundary & Settle):** Tạm ứng đúng hạn mức biên (100tr), vượt hạn mức biên (101tr), hoàn ứng đủ, hoàn ứng một phần (carryforward dư nợ sang kỳ sau), hoàn ứng đa người nhận.

Định dạng trình bày bắt buộc dưới cả 2 dạng:

1. **Dạng danh sách (Dễ đọc trực quan trên Slack):**
* **[Tên Sub Module] - [Mô tả kịch bản]**
  * *Bước thực hiện:* [Mô tả các bước thực hiện]
  * *Kết quả mong đợi:* [Kết quả mong đợi]
  * *Dữ liệu test:* [Dữ liệu test mẫu hoặc 'N/A']

2. **Dạng bảng UAT 5 cột (Bắt buộc bọc trong khối code triple-backtick ```text để hệ thống tự tạo file Excel và người dùng dễ dàng copy-paste, yêu cầu có ít nhất 15-20 hàng dữ liệu):**
```text
| Sub Module | Mô tả | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |
| :--- | :--- | :--- | :--- | :--- |
| [Tên Sub Module, ví dụ: 10.2. Quản lý truy thu/truy lĩnh] | [Mô tả kịch bản test] | [Mô tả các bước thực hiện thao tác thực tế cực kỳ chi tiết, ví dụ:<br>1. Truy cập vào chức năng Kế toán -> Quản lý tạm ứng<br>2. Click nút "Thêm mới"<br>3. Nhập dữ liệu... (xuống dòng bằng <br>)] | [Kết quả mong đợi chi tiết của hệ thống] | [Dữ liệu kiểm thử cụ thể và thực tế dưới dạng khóa-giá trị, ví dụ: Mã NV: NV-0451<br>Mã Deal: DEAL-0045<br>Số tiền: 101,000,000 VNĐ (BẮT BUỘC KHÔNG ghi chung chung kiểu 'NV A', '101tr', 'N/A')] |
```

* **Trường hợp biên:** [Nêu ra các tình huống đặc biệt cần lưu ý như dữ liệu rỗng, sai định dạng, sai trạng thái]

### ⚠️ Cảnh báo & Thiếu sót tài liệu (nếu có)
* [Liệt kê các điểm mâu thuẫn hoặc thông tin còn thiếu trong SRS]

### 📖 Nguồn tham chiếu
* [Nêu rõ tên file tài liệu làm nguồn tham chiếu]
"""

# Thiết lập model Gemini 3.1 Flash Lite cùng với các công cụ đọc tệp cục bộ và system instruction
model = genai.GenerativeModel(
    model_name="gemini-3.1-flash-lite",
    system_instruction=system_instruction,
    tools=[search_srs_files, read_srs_file]
)

# Khởi tạo Async Slack App
app = AsyncApp(token=os.environ.get("SLACK_BOT_TOKEN"))

@app.event("app_mention")
async def handle_mention(event, say, client):
    text = event.get("text", "")
    thread_ts = event.get("thread_ts")
    ts = event.get("ts")
    channel_id = event.get("channel")
    
    # Định vị thread đích: trả lời vào thread nếu tin nhắn nằm trong thread, ngược lại tạo thread mới
    target_thread_ts = thread_ts or ts
    
    # Lấy thông tin Bot User ID để loại bỏ mentions
    try:
        auth_info = await client.auth_test()
        bot_user_id = auth_info.get("user_id")
    except Exception as e:
        print(f"❌ Lỗi khi lấy thông tin bot auth: {e}")
        bot_user_id = None
        
    # Làm sạch query hiện tại
    query = text
    if bot_user_id:
        query = re.sub(r"<@.*?>", "", query).strip()
        
    if not query:
        await say("👋 Xin chào! Tôi là trợ lý AI chuyên giải đáp tài liệu SRS của dự án MaiVietLand. Hãy nhập câu hỏi sau khi tag tôi nhé! Ví dụ: `@SRS Assist luồng booking`", thread_ts=target_thread_ts)
        return
        
    print(f"📥 Nhận câu hỏi: '{query}' (Thread: {target_thread_ts})")
    
    # Xây dựng lịch sử hội thoại nếu cuộc trò chuyện thuộc một Thread
    history = []
    if thread_ts:
        print(f"🔄 Đang đồng bộ lịch sử hội thoại cho thread {thread_ts}...")
        try:
            result = await client.conversations_replies(channel=channel_id, ts=thread_ts)
            thread_messages = result.get("messages", [])
            
            # Xử lý các tin nhắn cũ (bỏ qua tin nhắn cuối cùng vì nó là câu hỏi hiện tại)
            current_role = None
            current_text_parts = []
            
            for msg in thread_messages[:-1]:
                msg_text = msg.get("text", "")
                if bot_user_id:
                    cleaned_msg_text = re.sub(r"<@.*?>", "", msg_text).strip()
                else:
                    cleaned_msg_text = msg_text.strip()
                    
                if not cleaned_msg_text:
                    continue
                    
                # Xác định vai trò (User hoặc Model)
                is_bot = "bot_id" in msg or msg.get("user") == bot_user_id
                role = "model" if is_bot else "user"
                
                if current_role is None:
                    current_role = role
                    current_text_parts = [cleaned_msg_text]
                elif current_role == role:
                    current_text_parts.append(cleaned_msg_text)
                else:
                    history.append({
                        "role": current_role,
                        "parts": [{"text": "\n".join(current_text_parts)}]
                    })
                    current_role = role
                    current_text_parts = [cleaned_msg_text]
                    
            if current_role and current_text_parts:
                history.append({
                    "role": current_role,
                    "parts": [{"text": "\n".join(current_text_parts)}]
                })
                
            # Đảm bảo lịch sử bắt đầu bằng 'user' và xen kẽ chuẩn
            while history and history[0]["role"] != "user":
                history.pop(0)
                
            # Giới hạn 10 tin nhắn gần nhất để tránh tràn context
            history = history[-10:]
            while history and history[0]["role"] != "user":
                history.pop(0)
                
        except Exception as e:
            print(f"⚠️ Lỗi khi đồng bộ lịch sử thread: {e}")
            history = []
            
    print(f"💬 Số lượt hội thoại trong lịch sử: {len(history)}")
    
    try:
        # Bắt đầu phiên chat với lịch sử hội thoại đã đồng bộ
        chat = model.start_chat(history=history, enable_automatic_function_calling=True)
        response = chat.send_message(query)
        
        # Phân tích xem câu trả lời có chứa bảng kịch bản UAT hay không
        excel_file = None
        try:
            rows = parse_markdown_table(response.text)
            if len(rows) > 1: # Ít nhất phải có dòng header + 1 dòng dữ liệu
                import tempfile
                fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
                os.close(fd)
                create_excel_from_rows(rows, temp_path)
                excel_file = temp_path
        except Exception as parse_ex:
            print(f"⚠️ Không thể parse bảng UAT sang Excel: {parse_ex}")
            excel_file = None
            
        # Gửi câu trả lời bằng văn bản trước
        await say(response.text, thread_ts=target_thread_ts)
        print("✅ Đã phản hồi văn bản lên Slack thành công!")
        
        # Nếu có file Excel, tải file đó lên Slack
        if excel_file:
            try:
                print(f"📤 Đang tải file Excel kịch bản UAT lên Slack...")
                await client.files_upload_v2(
                    channel=channel_id,
                    file=excel_file,
                    filename="Kich_ban_UAT.xlsx",
                    title="Kịch bản UAT (Sinh tự động)",
                    initial_comment="📊 Tôi đã tạo sẵn file Excel kịch bản UAT này để bạn tải về trực tiếp:",
                    thread_ts=target_thread_ts
                )
                print("✅ Đã tải file Excel lên Slack thành công!")
            except Exception as upload_ex:
                print(f"❌ Lỗi khi upload file Excel lên Slack: {upload_ex}")
                # Kiểm tra lỗi thiếu quyền ghi file của Slack app
                if "missing_scope" in str(upload_ex) or "not_in_channel" in str(upload_ex):
                    await say("⚠️ Bot phát hiện bảng kịch bản UAT nhưng không thể tự động tạo file Excel tải lên do thiếu quyền `files:write` trong ứng dụng Slack. Hãy cấu hình scope `files:write` cho Bot Token nếu muốn nhận file trực tiếp.", thread_ts=target_thread_ts)
            finally:
                # Xóa tệp tạm
                try:
                    os.remove(excel_file)
                except Exception:
                    pass
    except Exception as e:
        print(f"❌ Lỗi khi xử lý tin nhắn: {e}")
        await say(f"Lỗi khi xử lý câu hỏi: {str(e)}", thread_ts=target_thread_ts)

async def main():
    app_token = os.environ.get("SLACK_APP_TOKEN")
    if not app_token:
        print("Lỗi: Thiếu biến môi trường SLACK_APP_TOKEN trong .env.")
        return
        
    handler = AsyncSocketModeHandler(app, app_token)
    print("⚡️ Slack Bot (Direct Local Agent) đang chạy bằng gemini-3.1-flash-lite...")
    await handler.start_async()

if __name__ == "__main__":
    asyncio.run(main())
