"""
Google Antigravity SDK (google-antigravity) Multi-Agent Orchestrator for MVL Slack Assistant.
Provides:
  - Agent & LocalAgentConfig orchestration
  - Custom Python Tools:
      1. search_mvl_knowledge(query, include_code) -> 48,953-chunk SRS + Backend Docs + Code RAG
      2. inspect_plane_issue(issue_ref) -> Live Plane task resolution (MVL-3819, MVLGO-55, etc.)
      3. audit_srs_vs_code(module_query) -> Automated SRS-vs-Code audit
  - Subagents (SubagentConfig):
      1. business_advisor -> Pure-business, friendly, Zero-Intro responses starting with 💡
      2. code_auditor -> Technical code & formula deep-dive when user explicitly mentions 'check code'
  - BudgetConfig & CompactionConfig safeguards + Seamless Fast-Fallback to GeminiAgent.
"""

import os
import asyncio
import logging
from typing import Optional, List, Dict, Any

from rag_engine import SRSRagEngine
from plane_client import PlaneClient
from env_config import format_environment_context_for_agent
from gemini_agent import (
    GeminiAgent,
    SYSTEM_INSTRUCTION_DEFAULT as BUSINESS_SYSTEM_PROMPT,
    SYSTEM_INSTRUCTION_DEV as TECH_CHECK_CODE_SYSTEM_PROMPT,
    is_tech_requested,
    run_srs_code_audit,
    sanitize_agent_response,
)

logger = logging.getLogger("antigravity_engine")

try:
    from google.antigravity import Agent, LocalAgentConfig, types
    from google.antigravity.hooks import policy
    HAS_ANTIGRAVITY_SDK = True
except Exception as e:
    logger.warning(f"google-antigravity SDK import warning: {e}")
    HAS_ANTIGRAVITY_SDK = False


class MVLAntigravityEngine:
    """
    Production Multi-Agent Engine powered by Google Antigravity SDK (`google-antigravity`)
    with built-in custom tools, specialized subagents, and resilient fast-fallback.
    """

    def __init__(
        self,
        rag_engine: Optional[SRSRagEngine] = None,
        plane_client: Optional[PlaneClient] = None,
        gemini_fallback: Optional[GeminiAgent] = None,
    ):
        self.rag_engine = rag_engine or SRSRagEngine()
        self.plane_client = plane_client or PlaneClient()
        self.gemini_fallback = gemini_fallback or GeminiAgent()
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.app_data_dir = os.environ.get("AGY_APP_DATA_DIR", "/tmp/mvl_antigravity_brain")
        os.makedirs(self.app_data_dir, exist_ok=True)
        self.sdk_available = HAS_ANTIGRAVITY_SDK

    def build_tools(self, default_allow_tech: bool = False):
        """Creates bound Python tool functions for the Antigravity SDK Agent."""
        rag = self.rag_engine
        plane = self.plane_client

        def search_mvl_knowledge(query: str, include_code: bool = False) -> str:
            """Tra cứu cơ sở tri thức dự án MaiVietLand (48,953 chunks từ SRS, Backend Docs/Issues và Code ERP/AppSale).

            Args:
                query: Câu hỏi hoặc từ khóa nghiệp vụ/mã task cần tìm kiếm (ví dụ: 'MVL-3819 HHQL Hải Phòng', 'tạm ứng hoa hồng').
                include_code: Đặt True nếu người dùng yêu cầu 'check code', ngược lại đặt False để lấy thuần nghiệp vụ.
            """
            allow_tech = include_code or default_allow_tech
            chunks = rag.search(query, top_k=8, include_code=True)
            return rag.format_context(chunks, allow_tech=allow_tech)

        async def inspect_plane_issue(issue_ref: str) -> str:
            """Tra cứu thông tin chi tiết của task/issue trên Plane từ mã task hoặc URL (ví dụ: 'MVL-3819', 'MVLGO-55').

            Args:
                issue_ref: Mã task hoặc đường dẫn URL Plane (ví dụ: 'MVL-3819' hoặc 'pm.glinteco.com/glinteco/browse/MVL-3819').
            """
            plane_ctx, _ = await plane.resolve_issue_references_from_text(issue_ref)
            return plane_ctx or f"Không tìm thấy thông tin task Plane cho '{issue_ref}'."

        def audit_srs_vs_code(module_query: str = "") -> str:
            """Thực hiện đối chiếu (audit) tự động giữa tài liệu đặc tả SRS và mã nguồn thực tế của hệ thống MVL.

            Args:
                module_query: Tên phân hệ cần kiểm tra (ví dụ: 'commission', 'booking', 'hrm') hoặc để trống để kiểm tra toàn bộ.
            """
            report = run_srs_code_audit(module_query)
            return report.get("markdownSummary", "")

        def inspect_mvl_environment(url_or_query: str = "") -> str:
            """Tra cứu bản đồ 4 tier môi trường MVL (Local, Dev Glinteco, Dev Railway, Staging, Production),
            tài khoản test Chrome DevTools MCP và ánh xạ đường dẫn URL giao diện sang màn hình, API và task Plane liên quan.

            Args:
                url_or_query: Đường dẫn URL màn hình hoặc tên môi trường cần tra cứu (ví dụ: 'erp.maivietland.vn/accounting/commission-management/manager-monthly').
            """
            return format_environment_context_for_agent(url_or_query, include_token=default_allow_tech)

        return [search_mvl_knowledge, inspect_plane_issue, audit_srs_vs_code, inspect_mvl_environment]

    def create_agent_config(self, allow_tech: bool = False) -> Optional["LocalAgentConfig"]:
        """Builds a LocalAgentConfig with custom tools, subagents, budget, and compaction controls."""
        if not self.sdk_available or not self.api_key:
            return None

        tools = self.build_tools(default_allow_tech=allow_tech)
        sys_prompt = TECH_CHECK_CODE_SYSTEM_PROMPT if allow_tech else BUSINESS_SYSTEM_PROMPT

        business_subagent = types.SubagentConfig(
            name="business_advisor",
            description=(
                "Chuyên gia Phân tích Nghiệp vụ (Business Analyst) trả lời thuần ngôn ngữ kinh doanh, "
                "thân thiện, bắt đầu ngay ở dòng 1 bằng 💡, tuyệt đối không nhắc tên hàm/file/code."
            ),
            system_instructions=BUSINESS_SYSTEM_PROMPT,
            tools=tools,
            capabilities=types.SubagentCapabilities(
                agent_behavior=types.AgentBehavior.AUTONOMOUS,
            ),
        )

        code_subagent = types.SubagentConfig(
            name="code_auditor",
            description=(
                "Kỹ sư Kiểm toán Mã nguồn & Nghiệp vụ (Code & SRS Auditor) chỉ dùng khi người dùng yêu cầu "
                "'check code' hoặc đối chiếu SRS vs Code; phân tích chi tiết công thức, model, service và nguyên nhân gốc."
            ),
            system_instructions=TECH_CHECK_CODE_SYSTEM_PROMPT,
            tools=tools,
            capabilities=types.SubagentCapabilities(
                agent_behavior=types.AgentBehavior.AUTONOMOUS,
            ),
        )

        return LocalAgentConfig(
            api_key=self.api_key,
            app_data_dir=self.app_data_dir,
            system_instructions=sys_prompt,
            tools=tools,
            policies=[policy.allow_all()],
            capabilities=types.CapabilitiesConfig(
                agent_behavior=types.AgentBehavior.AUTONOMOUS,
                enable_subagents=True,
                max_subagent_depth=2,
                allowed_subagents=["business_advisor", "code_auditor"],
            ),
            subagents=[business_subagent, code_subagent],
            budget_config=types.BudgetConfig(
                max_model_calls=4,
                max_tool_calls=6,
                max_total_tokens=60_000,
            ),
            compaction_config=types.CompactionConfig(
                token_threshold=40_000,
            ),
        )

    async def generate_answer(
        self,
        query: str,
        srs_context: str = "",
        history: Optional[List[Dict[str, Any]]] = None,
        instruction_type: str = "default",
        enriched_query: str = "",
        use_sdk_runtime: bool = False,
    ) -> str:
        """
        Generates a concise, zero-intro response.
        - When `use_sdk_runtime=True` (or `AGY_RUNTIME_ENABLED=true`), executes via Google Antigravity SDK `Agent`.
        - Automatically falls back to `GeminiAgent` (with pre-fetched 48,953-chunk RAG context) on timeout or error.
        """
        tech_mode = is_tech_requested(query) or instruction_type == "tech"
        enable_sdk = use_sdk_runtime or os.environ.get("AGY_RUNTIME_ENABLED", "false").lower() == "true"

        if enable_sdk and self.sdk_available and self.api_key and instruction_type in ("default", "tech"):
            try:
                cfg = self.create_agent_config(allow_tech=tech_mode)
                if cfg is not None:
                    prompt = (
                        f"DỮ LIỆU TRI THỨC ĐÃ TRA CỨU SẴN (SRS + PLANE + CODE):\n{srs_context}\n\n"
                        f"CÂU HỎI CỦA NGƯỜI DÙNG:\n{query}\n\n"
                        "YÊU CẦU: Bắt đầu NGAY LẬP TỨC ở dòng 1 bằng `💡 *[Tên nghiệp vụ]:*`, tuyệt đối KHÔNG có câu chào hỏi."
                    )
                    async with asyncio.timeout(22.0):
                        async with Agent(config=cfg) as agent:
                            resp = await agent.chat(prompt)
                            text = (await resp.text()).strip()
                            if text:
                                return sanitize_agent_response(text, allow_tech=tech_mode)
            except Exception as e:
                logger.warning(f"Antigravity SDK runtime fallback triggered: {e}")

        ans = self.gemini_fallback.generate(
            query=query,
            srs_context=srs_context,
            history=history,
            instruction_type=instruction_type,
            enriched_query=enriched_query,
        )
        return sanitize_agent_response(ans, allow_tech=tech_mode)

    def get_sdk_info(self) -> Dict[str, Any]:
        return {
            "sdk_package": "google-antigravity",
            "sdk_available": self.sdk_available,
            "subagents": ["business_advisor", "code_auditor"],
            "custom_tools": ["search_mvl_knowledge", "inspect_plane_issue", "audit_srs_vs_code", "inspect_mvl_environment"],
            "budget": {"max_model_calls": 4, "max_tool_calls": 6, "max_total_tokens": 60000},
        }
