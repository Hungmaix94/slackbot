import os
import json
import sqlite3
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

logger = logging.getLogger("testcase_collector")

class TestcaseCollector:
    def __init__(self, db_path: Optional[str] = None, jsonl_path: Optional[str] = None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.db_path = db_path or os.environ.get("SRS_FTS_DB_PATH", os.path.join(base_dir, "srs_fts.db"))
        self.jsonl_path = jsonl_path or os.path.join(base_dir, "data", "user_query_testcases.jsonl")
        os.makedirs(os.path.dirname(self.jsonl_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute("""
            CREATE TABLE IF NOT EXISTS user_query_testcases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tc_code TEXT UNIQUE,
                user_id TEXT,
                channel_id TEXT,
                thread_ts TEXT,
                question TEXT NOT NULL,
                answer TEXT,
                module TEXT,
                category TEXT,
                citations TEXT,
                status TEXT DEFAULT 'collected',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)
            conn.commit()
            cur.execute("SELECT COUNT(*) FROM user_query_testcases")
            current_count = cur.fetchone()[0]
            if current_count == 0 and os.path.exists(self.jsonl_path):
                loaded = 0
                with open(self.jsonl_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            rec = json.loads(line)
                            cites = rec.get("citations", [])
                            cites_str = "; ".join(cites) if isinstance(cites, list) else str(cites or "")
                            cur.execute(
                                """
                                INSERT OR IGNORE INTO user_query_testcases
                                (tc_code, user_id, channel_id, thread_ts, question, answer, module, category, citations, status, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    rec.get("tc_code"),
                                    rec.get("user_id"),
                                    rec.get("channel_id") or "C0BHQDFV77S",
                                    rec.get("thread_ts"),
                                    rec.get("question", ""),
                                    rec.get("answer", ""),
                                    rec.get("module", "Nghiệp vụ chung"),
                                    rec.get("category", "General_QA"),
                                    cites_str,
                                    rec.get("status", "collected"),
                                    rec.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                ),
                            )
                            loaded += 1
                        except Exception:
                            continue
                conn.commit()
                logger.info(f"Seeded {loaded} testcases from {self.jsonl_path} into user_query_testcases.")
            conn.close()
            logger.info("Initialized user_query_testcases table.")
        except Exception as e:
            logger.error(f"Failed to init user_query_testcases table: {e}")

    def detect_module(self, question: str, citations: str = "") -> str:
        text = (question + " " + citations).lower()
        if any(w in text for w in ["khách hàng", "customer", "tiềm năng", "sale portal", "appsale", "storefront", "import"]):
            return "Khách hàng & AppSale"
        elif any(w in text for w in ["hoa hồng", "hhql", "commission", "kpi", "thưởng", "thu nhập chịu thuế", "thuế tncn", "tạm giữ", "quyết toán"]):
            return "Kế toán & Hoa hồng"
        elif any(w in text for w in ["hợp đồng cọc", "đặt cọc", "deposit", "đối chiếu cđt", "phiếu thu", "deal", "giao dịch", "hủy cọc", "hoàn cọc"]):
            return "Bán hàng & Hợp đồng"
        elif any(w in text for w in ["booking", "giữ chỗ", "lock căn", "giỏ hàng", "bảng hàng", "căn hộ"]):
            return "Booking & Giỏ hàng"
        elif any(w in text for w in ["chấm công", "timesheet", "vân tay", "zk", "nghỉ phép", "hđlđ", "thử việc", "điều chuyển", "nhân sự", "phòng ban", "chi nhánh"]):
            return "Nhân sự (HRM)"
        elif any(w in text for w in ["phân quyền", "role", "permission", "bảo mật", "quyền theo field"]):
            return "Phân quyền & Bảo mật (RBAC)"
        return "Nghiệp vụ chung"

    def detect_category(self, question: str) -> str:
        q = question.lower()
        if any(w in q for w in ["chưa", "có chưa", "đã có", "hỗ trợ chưa", "tính năng này"]):
            return "Feature_Existence"
        elif any(w in q for w in ["vì sao", "tại sao", "lỗi", "âm", "không khớp", "bị sai", "không hiển thị", "duplicate"]):
            return "Troubleshooting_Calculation"
        elif any(w in q for w in ["khác gì", "phân biệt", "là gì", "ý nghĩa"]):
            return "FactCheck_Terminology"
        elif any(w in q for w in ["quy trình", "các bước", "làm thế nào", "cách tạo", "nhập ở đâu"]):
            return "ProcessFlow_Guide"
        elif any(w in q for w in ["task", "issue", "plane", "clickup", "mvl-"]):
            return "Task_Verification"
        return "General_QA"

    def save_testcase(
        self,
        question: str,
        answer: str,
        user_id: Optional[str] = None,
        channel_id: Optional[str] = None,
        thread_ts: Optional[str] = None,
        citations: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        cleaned_question = question.strip()
        if not cleaned_question:
            return {}

        citations_str = "; ".join(citations) if citations else ""
        module = self.detect_module(cleaned_question, citations_str)
        category = self.detect_category(cleaned_question)
        created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        tc_code = ""
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            
            # Check duplicate in current session/recent queries to avoid spamming same question
            cur.execute("SELECT id, tc_code FROM user_query_testcases WHERE question = ? ORDER BY id DESC LIMIT 1", (cleaned_question,))
            existing = cur.fetchone()
            if existing:
                tc_id = existing[0]
                tc_code = existing[1]
                # Update answer if newer
                cur.execute(
                    "UPDATE user_query_testcases SET answer = ?, citations = ?, created_at = ? WHERE id = ?",
                    (answer, citations_str, created_at, tc_id)
                )
            else:
                cur.execute("""
                INSERT INTO user_query_testcases (user_id, channel_id, thread_ts, question, answer, module, category, citations, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, channel_id, thread_ts, cleaned_question, answer, module, category, citations_str, created_at))
                tc_id = cur.lastrowid
                tc_code = f"TC_USER_{tc_id:04d}"
                cur.execute("UPDATE user_query_testcases SET tc_code = ? WHERE id = ?", (tc_code, tc_id))

            conn.commit()
            conn.close()

            # Append to JSONL dataset
            record = {
                "tc_code": tc_code,
                "timestamp": created_at,
                "user_id": user_id,
                "channel_id": channel_id,
                "thread_ts": thread_ts,
                "module": module,
                "category": category,
                "question": cleaned_question,
                "answer": answer,
                "citations": citations or [],
                "status": "collected",
            }
            with open(self.jsonl_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

            logger.info(f"Saved user query testcase {tc_code} (Module: {module}, Cat: {category})")
            return record

        except Exception as e:
            logger.error(f"Error saving user query testcase: {e}")
            return {}

    def get_testcases(self, limit: int = 100, module: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            if module:
                cur.execute(
                    "SELECT tc_code, user_id, channel_id, thread_ts, question, answer, module, category, citations, status, created_at FROM user_query_testcases WHERE module = ? ORDER BY id DESC LIMIT ?",
                    (module, limit)
                )
            else:
                cur.execute(
                    "SELECT tc_code, user_id, channel_id, thread_ts, question, answer, module, category, citations, status, created_at FROM user_query_testcases ORDER BY id DESC LIMIT ?",
                    (limit,)
                )
            rows = cur.fetchall()
            conn.close()

            results = []
            for r in rows:
                results.append({
                    "tc_code": r[0],
                    "user_id": r[1],
                    "channel_id": r[2],
                    "thread_ts": r[3],
                    "question": r[4],
                    "answer": r[5],
                    "module": r[6],
                    "category": r[7],
                    "citations": r[8].split("; ") if r[8] else [],
                    "status": r[9],
                    "created_at": r[10],
                })
            return results
        except Exception as e:
            logger.error(f"Error fetching testcases: {e}")
            return []

    def get_stats(self) -> Dict[str, Any]:
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM user_query_testcases")
            total = cur.fetchone()[0]

            cur.execute("SELECT module, COUNT(*) FROM user_query_testcases GROUP BY module ORDER BY 2 DESC")
            by_module = dict(cur.fetchall())

            cur.execute("SELECT category, COUNT(*) FROM user_query_testcases GROUP BY category ORDER BY 2 DESC")
            by_category = dict(cur.fetchall())

            conn.close()
            return {
                "total_testcases": total,
                "by_module": by_module,
                "by_category": by_category,
            }
        except Exception as e:
            logger.error(f"Error getting testcase stats: {e}")
            return {"total_testcases": 0, "by_module": {}, "by_category": {}}

    def export_to_excel(self, output_path: Optional[str] = None) -> str:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if not output_path:
            output_path = os.path.join(base_dir, "data", "User_Questions_Testcases.xlsx")

        wb = openpyxl.Workbook()
        
        # Styles
        mvl_red = "B32B2F"
        header_fill = PatternFill(start_color=mvl_red, end_color=mvl_red, fill_type="solid")
        header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        sub_fill = PatternFill(start_color="2A364F", end_color="2A364F", fill_type="solid")
        sub_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        bold_font = Font(name="Segoe UI", size=10, bold=True)
        regular_font = Font(name="Segoe UI", size=10)
        code_font = Font(name="Consolas", size=9, bold=True, color="9A1A1E")
        
        thin_border = Border(
            left=Side(style='thin', color='DDDDDD'),
            right=Side(style='thin', color='DDDDDD'),
            top=Side(style='thin', color='DDDDDD'),
            bottom=Side(style='thin', color='DDDDDD')
        )

        # 1. Summary Sheet
        ws_summary = wb.active
        ws_summary.title = "Tổng quan Thống kê"
        ws_summary.views.sheetView[0].showGridLines = True

        stats = self.get_stats()
        ws_summary.merge_cells("A1:D1")
        title_cell = ws_summary["A1"]
        title_cell.value = "BÁO CÁO TỔNG HỢP TESTCASE THU THẬP TỰ ĐỘNG TỪ NGƯỜI DÙNG"
        title_cell.font = Font(name="Segoe UI", size=14, bold=True, color="FFFFFF")
        title_cell.fill = header_fill
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws_summary.row_dimensions[1].height = 40

        ws_summary["A3"] = "Tổng số Testcase thu thập:"
        ws_summary["A3"].font = bold_font
        ws_summary["B3"] = stats["total_testcases"]
        ws_summary["B3"].font = Font(name="Segoe UI", size=12, bold=True, color="B32B2F")

        # Table by Module
        ws_summary["A5"] = "STT"
        ws_summary["B5"] = "Phân hệ nghiệp vụ"
        ws_summary["C5"] = "Số lượng Testcase"
        for col_letter in ["A", "B", "C"]:
            cell = ws_summary[f"{col_letter}5"]
            cell.font = sub_font
            cell.fill = sub_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        row_idx = 6
        stt = 1
        for mod, count in stats["by_module"].items():
            ws_summary[f"A{row_idx}"] = stt
            ws_summary[f"B{row_idx}"] = mod
            ws_summary[f"C{row_idx}"] = count
            for col_letter in ["A", "B", "C"]:
                c = ws_summary[f"{col_letter}{row_idx}"]
                c.font = regular_font
                c.border = thin_border
                c.alignment = Alignment(horizontal="center" if col_letter in ["A", "C"] else "left")
            row_idx += 1
            stt += 1

        # 2. Detail Sheet
        ws_detail = wb.create_sheet(title="Danh sách Testcase")
        ws_detail.views.sheetView[0].showGridLines = True

        headers = [
            "Mã TC", "Thời gian", "Phân hệ", "Loại kịch bản", "Người hỏi (Slack)",
            "Câu hỏi người dùng (Input Prompt)", "Kết quả AI trả về (Expected Output)",
            "Tài liệu đối chiếu (SRS Citations)", "Trạng thái"
        ]
        ws_detail.row_dimensions[1].height = 30
        for col_idx, h in enumerate(headers, 1):
            cell = ws_detail.cell(row=1, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

        testcases = self.get_testcases(limit=500)
        for r_idx, tc in enumerate(testcases, 2):
            ws_detail.row_dimensions[r_idx].height = 60
            ws_detail.cell(row=r_idx, column=1, value=tc["tc_code"]).font = code_font
            ws_detail.cell(row=r_idx, column=2, value=tc["created_at"]).font = regular_font
            ws_detail.cell(row=r_idx, column=3, value=tc["module"]).font = bold_font
            ws_detail.cell(row=r_idx, column=4, value=tc["category"]).font = regular_font
            ws_detail.cell(row=r_idx, column=5, value=tc["user_id"] or "Unknown").font = regular_font
            ws_detail.cell(row=r_idx, column=6, value=tc["question"]).font = regular_font
            ws_detail.cell(row=r_idx, column=7, value=tc["answer"]).font = regular_font
            ws_detail.cell(row=r_idx, column=8, value="; ".join(tc["citations"])).font = regular_font
            ws_detail.cell(row=r_idx, column=9, value=tc["status"].upper()).font = bold_font

            for c_idx in range(1, 10):
                c = ws_detail.cell(row=r_idx, column=c_idx)
                c.border = thin_border
                c.alignment = Alignment(
                    horizontal="center" if c_idx in [1, 2, 5, 9] else "left",
                    vertical="top",
                    wrap_text=True
                )

        # Auto width
        column_widths = {1: 16, 2: 20, 3: 22, 4: 25, 5: 18, 6: 45, 7: 55, 8: 30, 9: 14}
        for col_idx, width in column_widths.items():
            ws_detail.column_dimensions[get_column_letter(col_idx)].width = width
        ws_summary.column_dimensions["A"].width = 8
        ws_summary.column_dimensions["B"].width = 30
        ws_summary.column_dimensions["C"].width = 20

        wb.save(output_path)
        logger.info(f"Exported testcases to {output_path}")
        return output_path
