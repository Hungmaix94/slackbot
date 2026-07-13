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

### 🧪 Kịch bản Kiểm thử & Điều kiện biên
* **Bảng kịch bản UAT (Bắt buộc phải bọc bảng Markdown có đủ 5 cột trong khối code triple-backtick ``` để hiển thị căn lề đều trên Slack và dễ dàng sao chép vào Excel):**
```text
| Sub Module | Mô tả kịch bản | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |
| :--- | :--- | :--- | :--- | :--- |
| [Tên Sub Module, ví dụ: 10.2. Quản lý truy thu/truy lĩnh] | [Mô tả kịch bản test] | [Các bước thực hiện chi tiết, xuống dòng bằng dấu <br>] | [Kết quả mong đợi tương ứng] | [Dữ liệu test mẫu nếu có, nếu không có bắt buộc ghi '-' hoặc 'N/A'] |
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
        
        # Gửi câu trả lời trực tiếp vào thread
        await say(response.text, thread_ts=target_thread_ts)
        print("✅ Đã phản hồi trực tiếp lên Slack thành công!")
    except Exception as e:
        print(f"❌ Lỗi khi gọi Gemini API: {e}")
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
