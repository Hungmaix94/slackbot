# 🤖 MVL Assistant Slackbot (Cloudflare Edge Edition)

> Trợ lý AI thế hệ mới trên nền tảng **Cloudflare Serverless & Edge** (TypeScript, Hono, Vectorize, D1, KV, R2, AI Gateway, Gemini 2.5) hỗ trợ BA, QA, Dev và Quản lý dự án MaiVietLand.

---

## 🌟 Điểm nổi bật & Tính năng thông minh

1. **Kiến trúc Serverless Edge (Cloudflare Workers):**
   - Không cần duy trì máy chủ VPS hay tiến trình Python socket mode thường trực.
   - Phản hồi webhook cho Slack trong vòng **< 200ms** (loại bỏ hoàn toàn lỗi Slack 3-second timeout và retry).
   - Tự động scale toàn cầu, chi phí duy trì gần như bằng 0.

2. **Hệ thống Tri thức Lai (Hybrid RAG):**
   - Kết hợp **Cloudflare Vectorize** (Semantic Search) + **Cloudflare D1** (Full-text FTS5).
   - Tra cứu chính xác từng đề mục tài liệu SRS, trích dẫn rõ ràng nguồn tài liệu `[Nguồn: features/booking/brd.md]`.
   - Cơ chế tự động đồng bộ tài liệu từ GitHub repo `srs` qua API `/sync/github`.

3. **Điều phối Đa Tác tử (Multi-Agent Routing):**
   - **SRS Q&A Agent:** Trả lời trực diện, siêu ngắn gọn, trung thực 100% với tài liệu.
   - **Senior BA Agent:** Phân tích luồng nghiệp vụ, vẽ sơ đồ Mermaid, sinh 10-14 Use Case chuẩn Karl Wiegers (Tổng quan + Chi tiết đồng bộ 1-1).
   - **QA Test Lead Agent:** Thiết kế ma trận kiểm thử, sinh 15-20 kịch bản UAT phân nhóm Positive, Negative, Permissions, UI/UX, Boundary với dữ liệu test cụ thể.
   - **ClickUp Smart Triage Agent:** Tự động đọc thread thảo luận lỗi trên Slack -> trích xuất bước tái hiện, môi trường, thiết bị -> phát hiện trùng lặp bug trên ClickUp -> tạo task chuẩn template MVL và tự động đính kèm ảnh/video.
   - **Staff Dev / Code Agent (Mới):** Tự động đọc mã nguồn thực tế từ các GitHub repo (`backend`, `web`, `mobile`, `chat`, `app-sale`) qua GitHub API bằng PAT. Hỗ trợ đối chiếu độ lệch (Drift Detection) giữa tài liệu SRS và Code thật, tra cứu Model/Serializer/Endpoint URL.

4. **Đọc & Phân tích Codebase Trực tiếp từ GitHub (PAT Integration):**
   - Không cần mount mã nguồn gigabytes vào Worker: Worker tự động gọi GitHub API on-demand để search code và đọc file cụ thể theo branch.
   - Hỗ trợ tra cứu nhanh: `search_codebase`, `read_code_file`, `list_repository_files`.

5. **Sinh & Định dạng Bảng tính Excel trên Bộ nhớ (ExcelJS):**
   - Sinh file Excel UAT / Use Case đúng định dạng màu sắc header, border, căn lề và công thức tính ID tự động `=IF(G2="","",COUNTA($G$2:G2))` mà không cần ghi ra ổ cứng.
   - Upload trực tiếp lên Slack thread bằng Slack `files.uploadV2` và lưu trữ backup trên Cloudflare R2.

6. **Trải nghiệm Slack Block Kit Tương tác:**
   - Cập nhật tiến trình thời gian thực (`⏳ [1/3] Đang phân tích...`, `⏳ [Code Agent] Đang đọc file...`).
   - Thẻ tương tác với các nút: `[📊 Tải Excel]`, `[🐛 Tạo Bug ClickUp]`, `[➕ Thêm Kịch bản Biên]`.

---

## 🏗️ Cấu trúc Thư mục

```
slackbot/
├── src/
│   ├── index.ts               # Hono App siêu gọn (~25 dòng), mount các route modules
│   ├── config/
│   │   └── env.ts             # Định nghĩa Interface Env & Cloudflare Bindings
│   ├── core/                  # [MỚI] Tầng lõi thực thi Agent & AI Client Factory
│   │   ├── types.ts           # Types cho ToolCall, AgentRunnerOptions, AgentRunnerResult
│   │   ├── ai-client-factory.ts # Factory cấp phát Gemini / Workers-AI client
│   │   └── agent-runner.ts    # Vòng lặp ReAct / Multi-turn chuẩn hóa & khử hallucination
│   ├── tools/                 # [MỚI] Khai báo & Thực thi công cụ cho Agent
│   │   ├── index.ts           # Tool Registry
│   │   └── code-tools.ts      # search_codebase, read_code_file, list_repository_files
│   ├── workflows/             # [MỚI] Các luồng nghiệp vụ độc lập (Single Responsibility)
│   │   ├── index.ts           # Workflow index
│   │   ├── srs-qa.workflow.ts # Luồng hỏi đáp SRS RAG, Code Drift & xuất Excel
│   │   ├── task-creator.workflow.ts # Luồng tạo bug/task Plane từ Slack thread
│   │   ├── plane-search.workflow.ts # Luồng tra cứu Issue trên Plane
│   │   └── project-config.workflow.ts # Luồng quản lý project mặc định cho kênh
│   ├── agents/
│   │   ├── router.ts          # Bộ phân loại ý định người dùng (Intent Classifier)
│   │   ├── prompts.ts         # System prompts chuẩn hóa (BA, QA, DEV, Q&A)
│   │   ├── code-context.ts    # Trích xuất ngữ cảnh code thông minh
│   │   └── orchestrator.ts    # Facade điều phối mỏng (~100 dòng), ủy quyền cho workflows
│   ├── routes/                # [MỚI] Hono Route Handlers tách rời
│   │   ├── index.ts           # Routes index
│   │   ├── slack.routes.ts    # /slack/events, /slack/commands, /slack/interactions
│   │   ├── sync.routes.ts     # /sync/github
│   │   ├── plane.routes.ts    # /plane/users
│   │   └── test.routes.ts     # /test/query (tái sử dụng SrsQaWorkflow / AgentRunner)
│   ├── slack/                 # Slack Web API Client, Block Kit UI, User mapping
│   ├── plane/                 # Native Plane REST API Client, Duplicates, Task Builder, Projects
│   ├── clickup/               # Native ClickUp REST API Client, Duplicates, Task Builder
│   ├── github/                # GitHub API Client (Codebase reader via PAT)
│   ├── rag/                   # Hybrid RAG (Vectorize + D1 Full-text FTS5, Chunker)
│   ├── ai/                    # Gemini Client, Workers-AI Client, Task Extractor
│   ├── excel/                 # Sinh file Excel UAT & Use Case in-memory bằng ExcelJS
│   └── utils/                 # Chuyển đổi Markdown sang Slack mrkdwn & Slugify
├── scripts/
│   └── sync-local-srs.ts      # Script đồng bộ tài liệu SRS từ local lên Cloudflare
├── schema.sql                 # D1 Database Schema
├── wrangler.jsonc             # Cấu hình Cloudflare Wrangler
└── package.json
```

---

## 🚀 Hướng dẫn Cài đặt & Triển khai

### 1. Chuẩn bị môi trường & Cài đặt dependencies
```bash
npm install
```

### 2. Cấu hình Cloudflare Resources (D1, KV, Vectorize, R2)
Chạy các lệnh sau trên terminal để tạo tài nguyên Cloudflare:
```bash
# Tạo D1 Database
npx wrangler d1 create mvl-srs-db
# Chạy migration schema vào D1
npx wrangler d1 execute mvl-srs-db --local --file=./schema.sql
npx wrangler d1 execute mvl-srs-db --remote --file=./schema.sql

# Tạo KV Namespace
npx wrangler kv:namespace create SLACKBOT_KV

# Tạo Vectorize Index
npx wrangler vectorize create mvl-srs-vectors --dimensions=768 --metric=cosine

# Tạo R2 Bucket
npx wrangler r2 bucket create mvl-slackbot-artifacts
```
*(Cập nhật các ID trả về vào file `wrangler.jsonc`)*.

### 3. Cấu hình Secrets trên Cloudflare
```bash
npx wrangler secret put SLACK_BOT_TOKEN        # xoxb-...
npx wrangler secret put SLACK_SIGNING_SECRET   # Mã signing secret từ Slack App Settings
npx wrangler secret put GEMINI_API_KEY         # Google Gemini API Key
npx wrangler secret put GITHUB_TOKEN           # GitHub Personal Access Token (PAT) để đọc code
npx wrangler secret put CLICKUP_API_TOKEN      # ClickUp API Key (pk_...)
npx wrangler secret put GITHUB_WEBHOOK_SECRET  # Secret bảo vệ endpoint /sync/github
```

### 4. Chạy kiểm thử cục bộ (Local Dev)
```bash
npm run dev
```
Worker sẽ chạy tại `http://localhost:8787`. Bạn có thể dùng Cloudflare Tunnel (`cloudflared tunnel`) để expose ra internet cho Slack gọi vào.

### 5. Triển khai lên Production (Deploy)
```bash
npm run deploy
```

---

## ⚙️ Cấu hình trên Slack App Dashboard (api.slack.com)

1. **Event Subscriptions:**
   - Bật **Enable Events**.
   - Request URL: `https://<YOUR_WORKER_DOMAIN>/slack/events` (Slack sẽ tự động xác thực URL challenge).
   - Subscribe to bot events: `app_mention`, `message.channels`, `message.groups`.

2. **Interactivity & Shortcuts:**
   - Bật **Interactivity**.
   - Request URL: `https://<YOUR_WORKER_DOMAIN>/slack/interactions`.

3. **Slash Commands:**
   - Tạo các lệnh trỏ về Request URL: `https://<YOUR_WORKER_DOMAIN>/slack/commands`
     - `/usecase [yêu cầu nghiệp vụ]`
     - `/testcase [yêu cầu kiểm thử]`
     - `/create-task`
     - `/bugs [từ khóa]`

4. **OAuth & Permissions (Bot Scopes):**
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`, `groups:history`
   - `files:write`, `files:read`
   - `reactions:write`
   - `users:read`

---

## 🔄 Đồng bộ Tài liệu SRS (Sync Pipeline)

Để nạp tài liệu SRS vào Vectorize & D1:
```bash
# Nạp từ thư mục SRS cục bộ vào Worker
npx tsx scripts/sync-local-srs.ts https://<YOUR_WORKER_DOMAIN>/sync/github <GITHUB_WEBHOOK_SECRET>
```
Hoặc cấu hình GitHub Actions trong repo `srs`: mỗi khi có push vào nhánh `main`, action sẽ tự động gửi nội dung các file `.md` mới/sửa qua API `/sync/github`.
