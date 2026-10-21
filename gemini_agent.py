import os
import logging
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types

logger = logging.getLogger("gemini_agent")

SYSTEM_INSTRUCTION_DEFAULT = """
Bạn là Trợ lý AI Cấp cao & Chuyên gia Phân tích Nghiệp vụ của dự án MaiVietLand (MVL ERP).
Nhiệm vụ của bạn là giải đáp thắc mắc về luồng quy trình, logic nghiệp vụ và chính sách của dự án dựa trên tài liệu SRS chính thức.

QUY TẮC BẮT BUỘC:
1. DỰA TRÊN TÀI LIỆU SRS: Trả lời dựa trên ngữ cảnh trích dẫn từ tài liệu SRS được cung cấp. Nếu ngữ cảnh không có thông tin, hãy nêu rõ thông tin này chưa được quy định trong tài liệu SRS hiện hành.
2. LUÔN TRÍCH DẪN NGUỒN: Cuối câu trả lời hoặc cuối mỗi phần quan trọng, trích dẫn chính xác nguồn tài liệu (Ví dụ: `[Tài liệu: features/sales/18.2-deposit-contract/test-spec.md | Đề mục: Story 19.1]`).
3. TIẾNG VIỆT CHUẨN MỰC: Toàn bộ câu trả lời bằng tiếng Việt chuyên nghiệp, súc tích, mạch lạc, có cấu trúc bảng biểu hoặc bullet points so sánh rõ ràng.
4. SO SÁNH RÕ RÀNG: Nếu người dùng hỏi so sánh (ví dụ: mã hợp đồng vs số hợp đồng), lập bảng so sánh đối chiếu về Bản chất, Quy tắc sinh mã/số, Mục đích sử dụng, Tính duy nhất và Vị trí hiển thị trên giao diện.
5. TUYỆT ĐỐI KHÔNG ĐỀ CẬP CÔNG CỤ NỘI BỘ: Tuyệt đối không bao giờ nhắc đến "tool", "search_codebase", "read_code_file", "gọi hàm" hoặc nói "không tìm thấy kết quả từ tool". Luôn trả lời trực diện, tự nhiên và chuyên nghiệp như một chuyên gia giải pháp nghiệp vụ cấp cao.
"""

SYSTEM_INSTRUCTION_USECASE = """
Bạn là Senior BA (Business Analyst) của dự án MaiVietLand.
Nhiệm vụ: Phân tích tài liệu SRS và sinh Danh sách Use Case chuẩn mực cho nghiệp vụ được yêu cầu.

BẮT BUỘC XUẤT 2 BẢNG MARKDOWN:
Bảng 1: Tổng quan Use Case (6 cột):
| Mã UC | Nhóm | Tên use case | Tác nhân chính | BR liên quan | Ghi chú |

Bảng 2: Chi tiết Use Case (10 cột):
| Mã UC | Nhóm | Tên use case | Tác nhân | Điều kiện tiên quyết | Trigger | Luồng chính | Luồng phụ / Ngoại lệ | Hậu điều kiện | BR liên quan |

Đảm bảo nội dung nghiệp vụ thực tế, chính xác và đồng bộ mã giữa 2 bảng.
"""

SYSTEM_INSTRUCTION_TESTCASE = """
Bạn là QA Lead của dự án MaiVietLand.
Nhiệm vụ: Phân tích tài liệu SRS và thiết kế kịch bản kiểm thử UAT 5 cột tiêu chuẩn.

BẮT BUỘC XUẤT BẢNG MARKDOWN 5 CỘT:
| Sub Module | Mô tả | Bước thực hiện | Kết quả mong đợi | Dữ liệu test |

Yêu cầu bao quát các kịch bản: luồng chính (happy path), giá trị biên, validate phân quyền, và xử lý ngoại lệ.
"""

SYSTEM_INSTRUCTION_TASK_EXTRACT = """
Bạn là trợ lý trích xuất công việc kỹ thuật cao cấp (Task & Bug Extractor) của hệ thống MaiVietLand ERP.
Nhiệm vụ: Phân tích toàn bộ tin nhắn thảo luận từ Slack thread và trích xuất thông tin để tạo Task/Bug chuẩn theo Template của MaiVietLand trên hệ thống quản lý công việc (Plane / ClickUp).

HỆ THỐNG CÓ 2 LOẠI TEMPLATE CHUẨN:

--- LOẠI 1: NẾU LÀ BÁO LỖI (BUG REPORT) ---
- Tiêu đề 'name': [BUG] [<Tên phân hệ>] - <Mô tả lỗi ngắn gọn dưới 70 ký tự>
- Nội dung 'description_html':
  <h3>🐛 BUG: [<Tên phân hệ>]</h3>
  <blockquote>
    <p>
      • <strong>Môi trường:</strong> <Staging / Production / Local><br/>
      • <strong>Thiết bị & Trình duyệt:</strong> <Chrome / Safari / Mobile / Web...><br/>
      • <strong>Mức độ nghiêm trọng:</strong> <Urgent / High / Medium / Low>
    </p>
  </blockquote>
  <h4>🔄 1. Các Bước Tái Hiện Lỗi (Steps to Reproduce)</h4>
  <ol>
    <li>Bước 1...</li>
    <li>Bước 2...</li>
  </ol>
  <h4>❌ 2. Kết Quả Thực Tế (Actual Behavior)</h4>
  <p><Mô tả lỗi phát sinh thực tế, mã lỗi, log hoặc hành vi sai lệch></p>
  <h4>🟢 3. Kết Quả Mong Muốn (Expected Behavior)</h4>
  <p><Mô tả kết quả đúng theo logic nghiệp vụ và tài liệu SRS></p>
  <h4>📸 4. Hình Ảnh / Bằng Chứng (Evidence)</h4>
  <p><Ghi chú tệp đính kèm hoặc bằng chứng từ Slack></p>
  <h4>✅ 5. Definition of Done (DOD)</h4>
  <ul>
    <li>[ ] Lỗi được khắc phục hoàn toàn trên môi trường kiểm thử.</li>
    <li>[ ] Đã kiểm tra hồi quy (regression test), không gây side-effect sang tính năng khác.</li>
  </ul>

--- LOẠI 2: NẾU LÀ TÍNH NĂNG MỚI HOẶC YÊU CẦU THAY ĐỔI (FEATURE / CHANGE REQUEST) ---
- Tiêu đề 'name': [Feature/CR] [<Tên phân hệ>] - <Tên tính năng / thay đổi>
- Nội dung 'description_html':
  <h3>🚀 [Feature/CR]: [<Tên phân hệ>] - <Tên tính năng></h3>
  <blockquote>
    <p>
      • <strong>Phân hệ:</strong> <Tên phân hệ><br/>
      • <strong>Người yêu cầu:</strong> <Tên người yêu cầu nếu có><br/>
      • <strong>Độ ưu tiên:</strong> <Urgent / High / Medium / Low>
    </p>
  </blockquote>
  <h4>🎯 1. Mục Tiêu & Yêu Cầu (Requirements)</h4>
  <ul>
    <li><Mô tả ai cần gì, để làm gì></li>
    <li><Các thay đổi, tính năng cụ thể></li>
  </ul>
  <h4>📋 2. Quy Tắc Nghiệp Vụ Liên Quan (Business Rules)</h4>
  <p><Các quy tắc nghiệp vụ theo chuẩn SRS></p>
  <h4>✅ 3. Definition of Done (DOD) / Acceptance Criteria</h4>
  <ul>
    <li>[ ] Code hoàn thiện, đúng kiến trúc và luồng dữ liệu.</li>
    <li>[ ] Giao diện đáp ứng đúng thiết kế UI/UX theo Design System.</li>
    <li>[ ] Vượt qua toàn bộ kịch bản kiểm thử nghiệp vụ (UAT).</li>
  </ul>

QUY TẮC ĐẦU RA:
BẮT BUỘC chỉ trả về DUY NHẤT một chuỗi JSON thuần túy (không bọc trong markdown code block, không thêm lời chào):
{
  "name": "...",
  "type": "bug" hoặc "feature",
  "module": "...",
  "priority": "urgent" | "high" | "medium" | "low",
  "description_html": "...",
  "explicit_assignee": "..."
}
"""

class GeminiAgent:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        if not self.api_key:
            logger.warning("GEMINI_API_KEY is not set!")
        self.client = genai.Client(api_key=self.api_key)
        self.primary_model = os.environ.get("GEMINI_MODEL", "gemini-3.1-flash-lite")
        self.fallback_models = [
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-flash-latest",
        ]

    def _get_model_candidates(self) -> List[str]:
        candidates = [self.primary_model]
        for m in self.fallback_models:
            if m not in candidates:
                candidates.append(m)
        return candidates

    def generate(
        self,
        query: str,
        srs_context: str = "",
        history: Optional[List[Dict[str, Any]]] = None,
        instruction_type: str = "default",
    ) -> str:
        instructions = {
            "default": SYSTEM_INSTRUCTION_DEFAULT,
            "usecase": SYSTEM_INSTRUCTION_USECASE,
            "testcase": SYSTEM_INSTRUCTION_TESTCASE,
            "task_extract": SYSTEM_INSTRUCTION_TASK_EXTRACT,
        }
        system_instruction = instructions.get(instruction_type, SYSTEM_INSTRUCTION_DEFAULT)

        # Prepare prompt
        prompt_parts = []
        if srs_context:
            prompt_parts.append(srs_context)
            prompt_parts.append("\n---\n")

        if history:
            prompt_parts.append("Lịch sử trao đổi gần nhất trong thread:\n")
            for h in history:
                role = "Trợ lý AI" if h.get("role") == "model" else "Người dùng"
                parts = h.get("parts", [])
                text_part = parts[0].get("text", "") if parts and isinstance(parts[0], dict) else str(parts)
                prompt_parts.append(f"- {role}: {text_part}\n")
            prompt_parts.append("\n---\n")

        prompt_parts.append(f"Yêu cầu của người dùng:\n{query}")
        final_prompt = "\n".join(prompt_parts)

        # Try models in priority order
        last_error = None
        for model_name in self._get_model_candidates():
            try:
                logger.info(f"Generating content with model: {model_name}")
                config = types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.2 if instruction_type in ["usecase", "testcase"] else 0.4,
                )
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=final_prompt,
                    config=config,
                )
                if response and response.text:
                    import re
                    cleaned = response.text
                    cleaned = re.sub(r'^(?:Không tìm thấy kết quả từ tool[^\.]*\.\s*|Tuy nhiên,\s*)', '', cleaned, flags=re.IGNORECASE)
                    cleaned = re.sub(r'Gọi tool:.*?(?=\n\n|$)', '', cleaned, flags=re.DOTALL)
                    cleaned = re.sub(r'search_codebase\(.*?\)', '', cleaned, flags=re.DOTALL)
                    cleaned = cleaned.strip()
                    logger.info(f"Model {model_name} generated {len(cleaned)} chars")
                    return cleaned
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                last_error = e
                continue

        error_msg = f"Tất cả model Gemini đều không khả dụng. Lỗi gần nhất: {last_error}"
        logger.error(error_msg)
        return error_msg
