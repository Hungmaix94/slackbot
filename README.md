# Slack SRS Q&A Bot (Direct Local Agent)

Bot Slack tích hợp Gemini 3.1 Flash Lite để giải đáp tài liệu SRS (Software Requirement Specifications) của dự án MaiVietLand nhanh chóng trong vòng 1-2 giây.

## Yêu cầu hệ thống
* Python 3.10 hoặc mới hơn.

## Hướng dẫn cài đặt

1. **Cấu hình môi trường ảo và cài đặt dependencies:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Cấu hình biến môi trường (`.env`):**
   Tạo tệp `.env` ở thư mục gốc của bot và điền các token sau:
   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   GEMINI_API_KEY=AIzaSy...
   ```

3. **Chạy bot ở chế độ cục bộ:**
   ```bash
   python3 slack_agent_bot.py
   ```
