import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gemini_agent import (
    GeminiAgent,
    classify_intent,
    is_tech_requested,
    get_smart_code_context,
    run_srs_code_audit,
    sanitize_agent_response,
)
from rag_engine import SRSRagEngine
from user_mapping import match_plane_member
from antigravity_engine import MVLAntigravityEngine


def run_python_330_test_suite():
    test_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "testcases_300_io.json")
    with open(test_file, "r", encoding="utf-8") as f:
        test_cases = json.load(f)

    rag = SRSRagEngine()
    agent = GeminiAgent(api_key="")  # Deterministic E2E evaluation with SRS FTS + Code Context
    agy = MVLAntigravityEngine(rag_engine=rag, gemini_fallback=agent)
    agy.api_key = "test-api-key-for-config-validation"
    agy_cfg = agy.create_agent_config(allow_tech=False)
    sdk_info = agy.get_sdk_info()
    assert sdk_info.get("sdk_package") == "google-antigravity"
    if sdk_info.get("sdk_available"):
        assert agy_cfg is not None, "LocalAgentConfig must be instantiated when google-antigravity is installed"

    stats = rag.get_stats()
    assert stats.get("ready"), f"SRS FTS Database must be ready, got: {stats}"
    assert stats.get("chunks", 0) >= 45000, f"Expected >= 45,000 full-spectrum chunks, got: {stats}"

    passed = 0
    failed = 0
    failures = []

    for tc in test_cases:
        try:
            query = tc["input"]["query"]
            expected = tc["expected_output"]

            actual_intent = classify_intent(query)
            actual_tech = is_tech_requested(query)

            if actual_intent != expected["intent"]:
                raise AssertionError(
                    f"Intent mismatch: expected '{expected['intent']}', got '{actual_intent}' for '{query}'"
                )

            if actual_tech != expected["tech_mode"]:
                raise AssertionError(
                    f"techMode mismatch: expected '{expected['tech_mode']}', got '{actual_tech}' for '{query}'"
                )

            cat = tc["category"]
            if cat == "BUSINESS_QA":
                chunks = rag.search(query, top_k=5)
                srs_ctx = rag.format_context(chunks, allow_tech=False)
                actual_answer = agent.generate(query=query, srs_context=srs_ctx, instruction_type="default")

                if not actual_answer.startswith("💡"):
                    raise AssertionError(f"Business answer must start immediately with 💡 (Zero Intro), got: {actual_answer[:60]}")
                if actual_answer.lower().startswith("chào bạn") or "với tư cách là" in actual_answer.lower():
                    raise AssertionError(f"Intro greeting leaked in output: {actual_answer[:80]}")

                for forbidden in expected.get("forbidden_terms_in_output", []):
                    if forbidden in actual_answer:
                        raise AssertionError(f"Forbidden tech term '{forbidden}' leaked in business output: {actual_answer}")
                for req_term in expected.get("required_terms_in_output", []):
                    if req_term.lower() not in actual_answer.lower():
                        raise AssertionError(f"Required term '{req_term}' missing in output: {actual_answer}")

            elif cat == "TECH_CHECK_CODE":
                chunks = rag.search(query, top_k=2)
                srs_ctx = rag.format_context(chunks)
                actual_answer = agent.generate(query=query, srs_context=srs_ctx, instruction_type="tech")
                if "💡 *Tóm tắt:*" not in actual_answer or "💻 *Logic Code:*" not in actual_answer:
                    raise AssertionError(f"Tech output missing concise template headers: {actual_answer}")

            elif cat == "FAST_PLANE_TASK":
                assignee = expected.get("expected_assignee")
                if assignee:
                    matched_member = match_plane_member([], raw_query=assignee)
                    if not matched_member or not matched_member.get("id"):
                        raise AssertionError(f"Failed to resolve Plane member for assignee '{assignee}'")

            elif cat == "SCHEDULED_AND_ONDEMAND_AUDIT":
                report = run_srs_code_audit(query)
                if report["totalChecked"] < 1 or "📋 *Báo cáo Audit SRS & Thực tế Hệ thống*" not in report["markdownSummary"]:
                    raise AssertionError(f"Invalid audit report for '{query}'")

            elif cat == "BA_USECASE_AND_QA_TESTCASE":
                inst_type = "usecase" if actual_intent == "BA" else "testcase"
                actual_answer = agent.generate(query=query, instruction_type=inst_type)
                for req in expected.get("required_terms_in_output", []):
                    if req not in actual_answer:
                        raise AssertionError(f"BA/QA output missing '{req}': {actual_answer[:100]}")

            elif cat == "PROJECT_SEARCH_AND_GUARDRAILS" and tc["input"].get("rawModelOutputToSanitize"):
                raw_dirty = tc["input"]["rawModelOutputToSanitize"]
                cleaned = sanitize_agent_response(raw_dirty, allow_tech=False)
                for forbidden in expected.get("forbidden_terms_in_output", []):
                    if forbidden.lower() in cleaned.lower():
                        raise AssertionError(
                            f"Python sanitizer failed to strip '{forbidden}' from '{raw_dirty}'. Got: '{cleaned}'"
                        )

            passed += 1
        except Exception as e:
            failed += 1
            failures.append(f"[{tc['id']}] {tc['description']} -> {e}")

    print("\n=============================================================")
    print("🐍 KẾT QUẢ CHẠY BỘ KIỂM THỬ E2E INPUT-OUTPUT (PYTHON + 48,789 SRS & CODE CHUNKS)")
    print(f"• Full-Spectrum RAG Database: {stats['chunks']} chunks ({stats['size_mb']} MB)")
    print(
        f"• Breakdown: SRS={stats.get('srs_chunks')} | Backend Docs/Issues={stats.get('backend_doc_chunks')} | ERP & AppSale Code={stats.get('code_chunks')}"
    )
    print(f"• Tổng số Test Cases: {len(test_cases)} (Yêu cầu tối thiểu: 300)")
    print(f"• Passed: {passed}/{len(test_cases)} ({(passed / len(test_cases)) * 100:.2f}%)")
    print(f"• Failed: {failed}")
    print("=============================================================\n")

    if failures:
        for fail in failures[:20]:
            print("❌", fail)
        sys.exit(1)


if __name__ == "__main__":
    run_python_330_test_suite()
