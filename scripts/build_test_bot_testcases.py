"""
Trích xuất toàn bộ câu hỏi & yêu cầu thực tế từ channel #test-bot (C0BHQDFV77S)
thành bộ Testcase chuẩn (SQLite + JSONL + Excel + E2E Test Suite).
"""
import html
import json
import os
import re
import sqlite3
import sys
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from gemini_agent import GeminiAgent, classify_intent, is_tech_requested, normalize_query_urls
from rag_engine import SRSRagEngine
from testcase_collector import TestcaseCollector

SLACK_USER_NAMES = {
    "U09U59A9FA4": "Hương QA/BA (U09U59A9FA4)",
    "U077A1H657C": "Hùng Phạm - hungpd (U077A1H657C)",
    "U0BDNFV9MB9": "QA/BA Team (U0BDNFV9MB9)",
    "U09T2V3KPEJ": "QA Tester (U09T2V3KPEJ)",
    "U093U4SP2Q6": "Dev ERP (U093U4SP2Q6)",
    "U095QDM2BKQ": "BA/PM Team (U095QDM2BKQ)",
    "U0402U1R0LS": "Khoa Lead (U0402U1R0LS)",
}

IGNORE_PATTERNS = [
    r"^người đâu",
    r"^accio my servant",
    r"^help me",
    r"^this message was deleted",
    r"^\.\d+",
    r"^thêm yêu cầu$",
    r"^log bug cho t nào$",
    r"^tạo cr clickup theo stt$",
    r"^chia hoa hồng theo tháng$",
    r"^danh sách giao dịch$",
    r"tạm dừng tạo task",
    r"^<mailto:",
    r"con srs của em đã tích hợp",
    r"anh nghĩ nên dùng token",
    r"c note được kiểu assign",
    r"^<@u0bdnfv9mb9>",
    r"^hãy tạo clickup",
    r"^tạo clickup cho tôi$",
    r"^assign cho tôi$",
    r"^cho tôi file testcase update$",
    r"^tạo file testcase$",
    r"^thay đổi như thế này, update testcase$",
    r"^link click up\s+https?://",
    r"^check logic trên$",
    r"^check lại logic validate giúp tôi$",
    r"^nội dung yêu cầu sticky table header",
    r"^update thêm ảnh hiện trạng vào clickup",
    r"^bổ sung thêm cho tôi là đưa cột",
    r"^update thêm cho tôi là cần sticky",
]


def clean_slack_text(raw: str) -> str:
    txt = html.unescape(raw or "")
    # Remove bot mention <@U0BGFDZMQ2W>
    txt = re.sub(r"<@U0BGFDZMQ2W>\s*", "", txt)
    # Replace <https://url|label> -> https://url
    txt = re.sub(r"<(https?://[^|>]+)\|[^>]+>", r"\1", txt)
    txt = re.sub(r"<(https?://[^>]+)>", r"\1", txt)
    # Collapse excessive curl headers if present
    if "curl --url" in txt:
        m = re.search(r"(.*?curl --url\s+'?[^\s']+'?)", txt, flags=re.DOTALL)
        if m:
            txt = m.group(1).strip()
    return txt.strip()


def should_keep_message(raw_text: str, cleaned: str) -> bool:
    if len(cleaned) < 14:
        return False
    low = cleaned.lower()
    for pat in IGNORE_PATTERNS:
        if re.search(pat, low):
            return False
    return True


def main():
    raw_path = "/tmp/test_bot_raw.json"
    if not os.path.exists(raw_path):
        print(f"Missing {raw_path}")
        sys.exit(1)

    with open(raw_path, "r", encoding="utf-8") as f:
        threads = json.load(f)

    rag = SRSRagEngine()
    agent = GeminiAgent(api_key="")  # Deterministic high-precision generator
    collector = TestcaseCollector()

    # Clear existing user_query_testcases to rebuild cleanly from test-bot channel
    conn = sqlite3.connect(collector.db_path)
    conn.execute("DELETE FROM user_query_testcases")
    conn.commit()
    conn.close()
    if os.path.exists(collector.jsonl_path):
        os.remove(collector.jsonl_path)

    extracted = []
    seen_questions = set()

    for t in threads:
        candidates = [(t["ts"], t["user"], t["text"], t["ts"])]
        # Also check follow-up questions in replies that tag <@U0BGFDZMQ2W>
        for r in t.get("replies", []):
            if "<@U0BGFDZMQ2W>" in r.get("text", ""):
                candidates.append((r["ts"], r["user"], r["text"], t["ts"]))

        for msg_ts, user_id, raw_text, thread_ts in candidates:
            cleaned = clean_slack_text(raw_text)
            if not should_keep_message(raw_text, cleaned):
                continue
            norm_key = re.sub(r"\s+", " ", cleaned.lower()).strip()
            if norm_key in seen_questions:
                continue
            seen_questions.add(norm_key)

            intent = classify_intent(cleaned)
            tech_mode = is_tech_requested(cleaned)
            clean_for_rag = normalize_query_urls(cleaned)

            citations = []
            if intent in ("SRS_QA", "SEARCH_PLANE"):
                chunks = rag.search(clean_for_rag, top_k=5)
                citations = [c.get("source", "") for c in chunks if c.get("source")]
                srs_ctx = rag.format_context(chunks, allow_tech=tech_mode)
                inst_type = "tech" if tech_mode else "default"
                expected_answer = agent.generate(query=cleaned, srs_context=srs_ctx, instruction_type=inst_type)
            elif intent in ("BA", "TESTCASE", "GENERATE_USECASE", "GENERATE_TESTCASE"):
                inst_type = "usecase" if "USECASE" in intent or intent == "BA" else "testcase"
                expected_answer = agent.generate(query=cleaned, instruction_type=inst_type)
            else:
                # TASK / BUG creation command
                expected_answer = (
                    f"✅ [FAST_PLANE_TASK] Tự động phân tích yêu cầu và khởi tạo work-item trên Plane "
                    f"(Project: MVL / MVLGO) từ yêu cầu: {cleaned[:160]}"
                )

            ts_float = float(msg_ts)
            created_str = datetime.fromtimestamp(ts_float).strftime("%Y-%m-%d %H:%M:%S")
            user_display = SLACK_USER_NAMES.get(user_id, user_id)

            rec = collector.save_testcase(
                question=cleaned,
                answer=expected_answer,
                user_id=user_display,
                channel_id="C0BHQDFV77S (#test-bot)",
                thread_ts=thread_ts,
                citations=citations[:4],
            )
            rec["slack_ts"] = msg_ts
            rec["intent"] = intent
            rec["tech_mode"] = tech_mode
            extracted.append(rec)

    # Save standalone test-bot dataset
    out_json = os.path.join(BASE_DIR, "tests", "test_bot_channel_testcases.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(extracted, f, ensure_ascii=False, indent=2)

    # Export Excel report
    excel_path = collector.export_to_excel()

    # Also merge real QA & TASK cases from test-bot into tests/testcases_300_io.json
    e2e_path = os.path.join(BASE_DIR, "tests", "testcases_300_io.json")
    with open(e2e_path, "r", encoding="utf-8") as f:
        e2e_cases = json.load(f)

    # Remove previous TC_TESTBOT_* if re-running
    e2e_cases = [c for c in e2e_cases if not str(c.get("id", "")).startswith("TC_TESTBOT_")]

    added_e2e = 0
    for idx, item in enumerate(extracted, 1):
        q = item["question"]
        intent = item["intent"]
        tech_mode = item["tech_mode"]
        if intent in ("SRS_QA", "SEARCH_PLANE") and not tech_mode:
            added_e2e += 1
            e2e_cases.append({
                "id": f"TC_TESTBOT_{added_e2e:03d}",
                "category": "BUSINESS_QA",
                "description": f"[#test-bot C0BHQDFV77S] {q[:90]}",
                "input": {
                    "channelId": "C0BHQDFV77S",
                    "threadTs": item["thread_ts"],
                    "query": q,
                },
                "expected_output": {
                    "intent": intent,
                    "tech_mode": False,
                    "forbidden_terms_in_output": ["DepartmentMonthlyKpi", "CommissionPayable", "SalesInvoiceLine"],
                    "required_terms_in_output": ["💡"],
                },
            })

    with open(e2e_path, "w", encoding="utf-8") as f:
        json.dump(e2e_cases, f, ensure_ascii=False, indent=2)

    stats = collector.get_stats()
    print(f"Extracted {len(extracted)} real testcases from #test-bot (C0BHQDFV77S)")
    print(f"Collector stats: {json.dumps(stats, ensure_ascii=False)}")
    print(f"Excel exported to: {excel_path}")
    print(f"Added {added_e2e} BUSINESS_QA cases to tests/testcases_300_io.json (Total E2E: {len(e2e_cases)})")


if __name__ == "__main__":
    main()
