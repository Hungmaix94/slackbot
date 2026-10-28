import gzip
import logging
import os
import re
import shutil
import sqlite3
import threading
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("rag_engine")

# Từ dừng tiếng Việt & từ nhiễu giao tiếp/URL không mang ý nghĩa phân biệt nghiệp vụ
VIETNAMESE_STOPWORDS = {
    "kiểm", "tra", "kiem", "logic", "của", "cua", "task", "này", "nay",
    "chi", "tiết", "tiet", "nghiệp", "vụ", "nghiep", "vu", "cho", "tôi",
    "toi", "hỏi", "hoi", "về", "ve", "như", "nhu", "thế", "the", "nào",
    "nao", "tại", "tai", "sao", "vì", "vi", "khi", "có", "co", "được",
    "duoc", "không", "khong", "là", "la", "gì", "gi", "các", "cac", "còn",
    "con", "lại", "lai", "với", "voi", "trong", "trên", "tren", "dưới",
    "duoi", "theo", "từ", "tu", "đến", "den", "cần", "can", "phải", "phai",
    "những", "nhung", "một", "mot", "hai", "ba", "bốn", "nam", "để", "de",
    "và", "va", "hoặc", "hoac", "nhưng", "nhung", "nếu", "neu", "thì", "thi",
    "rằng", "rang", "bị", "bi", "đã", "da", "đang", "dang", "sẽ", "se",
    "vào", "vao", "ra", "lên", "len", "xuống", "xuong", "qua", "làm", "lam",
    "cách", "cach", "tính", "tinh", "khác", "khac", "giúp", "giup", "em",
    "anh", "chị", "chi", "bạn", "ban", "mình", "minh", "ơi", "oi", "nhé",
    "nhe", "ạ", "a", "nhỉ", "nhi", "check", "code", "xem", "file", "hàm",
    "ham", "http", "https", "pm", "glinteco", "com", "browse", "projects",
    "issues", "work", "items", "app", "clickup", "slack", "archives",
    "hệ", "thống", "he", "thong", "mvl", "erp", "maivietland",
}

# Từ điển viết tắt & thuật ngữ chuyên biệt của MaiVietLand -> Cụm từ chuẩn trong SRS & Code
MVL_ACRONYM_EXPANSIONS: Dict[str, List[str]] = {
    "hhql": ["hoa hồng quản lý", "management_commission_service", "20.19", "sales_manager_source", "sales_director_source"],
    "gdkd": ["giám đốc kinh doanh", "sales_director_source", "kpi_sales_director"],
    "gđkd": ["giám đốc kinh doanh", "sales_director_source", "kpi_sales_director"],
    "tpkd": ["trưởng phòng kinh doanh", "sales_manager_source", "kpi_dept_leader"],
    "gdda": ["giám đốc dự án", "project_director_commission", "20.8.7"],
    "gđda": ["giám đốc dự án", "project_director_commission", "20.8.7"],
    "tkkd": ["thư ký kinh doanh", "business_secretary"],
    "slk": ["sàn liên kết", "linked_exchange", "f2"],
    "cdt": ["chủ đầu tư", "investor_reconciliation", "reconciliation"],
    "cđt": ["chủ đầu tư", "investor_reconciliation", "reconciliation"],
    "pbtv": ["phân bổ tiền về", "deal_period_worksheet", "fee_progress_pct"],
    "hddc": ["hợp đồng đặt cọc", "deposit_contract", "18.2"],
    "hđđc": ["hợp đồng đặt cọc", "deposit_contract", "18.2"],
    "dntt": ["đề nghị thanh toán", "payment_request"],
    "đntt": ["đề nghị thanh toán", "payment_request"],
    "ctv": ["cộng tác viên", "collaborator", "20.1"],
    "bctkd": ["chỉ tiêu kinh doanh", "20.11"],
    "tncn": ["thuế thu nhập cá nhân", "pit", "tax"],
}

# Các cụm từ chuyên ngành quan trọng (Bigrams / Trigrams) dùng để tăng điểm chính xác
DOMAIN_PHRASES = [
    "hoa hồng quản lý",
    "hải phòng",
    "chi nhánh",
    "sales_manager_source",
    "sales_director_source",
    "đối chiếu chủ đầu tư",
    "hóa đơn bán ra",
    "tạm ứng hoa hồng",
    "bảng chia hoa hồng",
    "đợt chi hoa hồng",
    "phiếu thu",
    "phiếu chi",
    "phân bổ tiền về",
    "hợp đồng đặt cọc",
    "giám đốc dự án",
    "sàn liên kết",
    "quỹ phòng",
    "kỳ kế toán",
    "ngày công tiêu chuẩn",
    "lịch sử công tác",
    "hỗ trợ phí",
    "thưởng nóng",
    "tấm gương",
    "gói cước",
    "đóng băng",
    "tổng kết hoa hồng",
    "giữ lại hoa hồng",
    "chuyển hướng người nhận",
    "ví tạm ứng",
    "manager-monthly",
    "bảng tổng kết hh quản lý",
    "cột hhql",
    "thưởng hh quản lý",
    "ẩn cột",
]


class SRSRagEngine:
    def __init__(self, db_path: Optional[str] = None):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if not db_path:
            possible_paths = [
                os.path.join(base_dir, "srs_fts.db"),
                "/mnt/D/Work/MVL/slackbot/srs_fts.db",
                "/app/srs_fts.db",
            ]
            for p in possible_paths:
                if os.path.exists(p):
                    db_path = p
                    break

        self.db_path = db_path or os.path.join(base_dir, "srs_fts.db")
        self._conn: Optional[sqlite3.Connection] = None
        self._lock = threading.Lock()
        self._search_cache: "OrderedDict[Tuple[str, int, bool], List[Dict[str, Any]]]" = OrderedDict()
        self._max_cache_size = 512
        self._cached_stats: Optional[Dict[str, Any]] = None
        self._ensure_db_decompressed()
        logger.info(f"Using SRS FTS DB at: {self.db_path}")

    def _get_connection(self) -> sqlite3.Connection:
        if self._conn is None:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.execute("PRAGMA mmap_size = 268435456;")
            conn.execute("PRAGMA cache_size = -64000;")
            conn.execute("PRAGMA temp_store = MEMORY;")
            conn.execute("PRAGMA query_only = ON;")
            self._conn = conn
        return self._conn

    def _ensure_db_decompressed(self) -> None:
        """Tự động giải nén srs_fts.db.gz nếu srs_fts.db chưa tồn tại hoặc là bản cũ (< 80MB)."""
        if os.path.exists(self.db_path) and os.path.getsize(self.db_path) > 80 * 1024 * 1024:
            return
        gz_candidates = [
            self.db_path + ".gz",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "srs_fts.db.gz"),
            "/app/srs_fts.db.gz",
        ]
        for gz_path in gz_candidates:
            if os.path.exists(gz_path):
                try:
                    logger.info(f"Decompressing {gz_path} -> {self.db_path}...")
                    with gzip.open(gz_path, "rb") as f_in, open(self.db_path, "wb") as f_out:
                        shutil.copyfileobj(f_in, f_out)
                    logger.info(f"Decompressed {self.db_path} successfully.")
                    return
                except Exception as e:
                    logger.error(f"Failed to decompress {gz_path}: {e}")

    def is_ready(self) -> bool:
        return os.path.exists(self.db_path)

    def get_stats(self) -> Dict[str, Any]:
        if self._cached_stats is not None:
            return self._cached_stats
        if not self.is_ready():
            return {"ready": False, "chunks": 0, "size_mb": 0}
        try:
            with self._lock:
                conn = self._get_connection()
                cur = conn.cursor()
                cur.execute("SELECT count(*) FROM srs_chunks")
                count = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM srs_chunks WHERE doc_id LIKE 'code:%'")
                code_count = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM srs_chunks WHERE doc_id LIKE 'backend-docs/%'")
                be_docs_count = cur.fetchone()[0]
            size_mb = os.path.getsize(self.db_path) / (1024 * 1024)
            self._cached_stats = {
                "ready": True,
                "chunks": count,
                "srs_chunks": count - code_count - be_docs_count,
                "backend_doc_chunks": be_docs_count,
                "code_chunks": code_count,
                "size_mb": round(size_mb, 2),
            }
            return self._cached_stats
        except Exception as e:
            logger.error(f"Error reading stats: {e}")
            return {"ready": False, "error": str(e)}

    def _extract_search_signals(self, query: str) -> Tuple[List[str], List[str], List[str]]:
        """
        Tách câu hỏi thành 3 nhóm tín hiệu tìm kiếm:
        1. exact_ids: Mã ticket/feature/code (VD: 86exztban, MVL-3819, MVLGO-55, 20.19, 17.4, sales_manager_source)
        2. matched_phrases: Cụm từ nghiệp vụ chính xác (VD: "hoa hồng quản lý", "hải phòng")
        3. keywords: Từ khóa đơn đã lọc stopwords
        """
        q_lower = query.lower()

        # 1. Exact IDs / identifiers
        exact_ids: List[str] = []
        # ClickUp IDs (e.g., 86exztban, 86eyumatv)
        for m in re.findall(r"\b86e[a-z0-9]{5,7}\b", q_lower):
            if m not in exact_ids:
                exact_ids.append(m)
        # Plane IDs (e.g., MVL-3819, MVLGO-55, MVLCTV-904)
        for m in re.findall(r"\b(?:mvl|mvlctv|mvlgo|mvl4)-\d+\b", q_lower):
            if m not in exact_ids:
                exact_ids.append(m)
        # Feature numbers (e.g., 20.19, 20.14, 17.4, 18.2, 2.1)
        for m in re.findall(r"\b(?:20\.\d+(?:\.\d+)?|21\.\d+|17\.\d+|18\.\d+|2\.[1-5]|3\.[1-5])\b", q_lower):
            if m not in exact_ids:
                exact_ids.append(m)
        # Snake_case / CamelCase code identifiers
        for m in re.findall(r"\b[a-z]+_[a-z0-9_]+\b", q_lower):
            if len(m) >= 5 and m not in exact_ids:
                exact_ids.append(m)

        # 2. Matched domain phrases & acronym expansions
        matched_phrases: List[str] = []
        for phrase in DOMAIN_PHRASES:
            if phrase in q_lower and phrase not in matched_phrases:
                matched_phrases.append(phrase)

        words_raw = re.findall(r"[\w\.]+", q_lower, flags=re.UNICODE)
        for w in words_raw:
            if w in MVL_ACRONYM_EXPANSIONS:
                for exp in MVL_ACRONYM_EXPANSIONS[w]:
                    if " " in exp or "_" in exp or "." in exp:
                        if exp not in matched_phrases:
                            matched_phrases.append(exp)
                    elif exp not in exact_ids:
                        exact_ids.append(exp)

        # 3. Clean keywords without stopwords
        clean_text = re.sub(r"https?://\S+", " ", q_lower)
        clean_text = re.sub(r"[^\w\s]", " ", clean_text, flags=re.UNICODE)
        keywords: List[str] = []
        for w in clean_text.split():
            if len(w) <= 1 or w in VIETNAMESE_STOPWORDS or w.isdigit():
                continue
            if w not in keywords:
                keywords.append(w)

        return exact_ids, matched_phrases, keywords

    def search(self, query: str, top_k: int = 8, include_code: bool = True) -> List[Dict[str, Any]]:
        if not self.is_ready():
            logger.warning("SRS FTS DB does not exist, cannot perform search.")
            return []

        cache_key = (query.strip().lower(), top_k, include_code)
        with self._lock:
            if cache_key in self._search_cache:
                self._search_cache.move_to_end(cache_key)
                return list(self._search_cache[cache_key])

        exact_ids, matched_phrases, keywords = self._extract_search_signals(query)
        if not exact_ids and not matched_phrases and not keywords:
            return []

        candidates_map: Dict[Tuple[str, str], Dict[str, Any]] = {}

        def add_rows(rows: List[Tuple[Any, ...]], boost: float = 0.0):
            for r in rows:
                doc_id, heading, content, fts_rank = r[0], r[1], r[2], float(r[3] or 0.0)
                if not include_code and doc_id.startswith("code:"):
                    continue
                key = (doc_id, heading)
                if key not in candidates_map:
                    candidates_map[key] = {
                        "doc_id": doc_id,
                        "heading": heading,
                        "content": content,
                        "fts_score": -fts_rank + boost,
                    }
                else:
                    candidates_map[key]["fts_score"] = max(candidates_map[key]["fts_score"], -fts_rank + boost)

        with self._lock:
            conn = self._get_connection()
            cur = conn.cursor()
            # Pass 1: Exact ID / Ticket / Feature lookup (highest precision)
            for eid in exact_ids[:5]:
                safe_id = eid.replace('"', "")
                try:
                    cur.execute(
                        """
                        SELECT doc_id, heading, content, bm25(srs_chunks_fts, 10.0, 6.0, 1.0) AS r
                        FROM srs_chunks_fts
                        WHERE srs_chunks_fts MATCH ?
                        ORDER BY r
                        LIMIT 15
                        """,
                        (f'"{safe_id}"',),
                    )
                    add_rows(cur.fetchall(), boost=45.0)
                except Exception:
                    pass

            # Pass 2: Exact Domain Phrases lookup (high precision)
            if matched_phrases:
                phrase_clauses = [f'"{p.replace(chr(34), "")}"' for p in matched_phrases[:6]]
                phrase_fts = " OR ".join(phrase_clauses)
                try:
                    cur.execute(
                        """
                        SELECT doc_id, heading, content, bm25(srs_chunks_fts, 8.0, 5.0, 1.0) AS r
                        FROM srs_chunks_fts
                        WHERE srs_chunks_fts MATCH ?
                        ORDER BY r
                        LIMIT 35
                        """,
                        (phrase_fts,),
                    )
                    add_rows(cur.fetchall(), boost=25.0)
                except Exception as e:
                    logger.debug(f"Phrase FTS error: {e}")

            # Pass 3: Meaningful Keyword AND/OR search
            if keywords:
                safe_kws = [re.sub(r"[^\w]", "", k, flags=re.UNICODE) for k in keywords[:10] if k]
                safe_kws = [k for k in safe_kws if len(k) > 1]
                if len(safe_kws) >= 2:
                    pair_clauses = []
                    for i in range(min(len(safe_kws) - 1, 5)):
                        pair_clauses.append(f'("{safe_kws[i]}" AND "{safe_kws[i+1]}")')
                    and_fts = " OR ".join(pair_clauses)
                    try:
                        cur.execute(
                            """
                            SELECT doc_id, heading, content, bm25(srs_chunks_fts, 8.0, 5.0, 1.0) AS r
                            FROM srs_chunks_fts
                            WHERE srs_chunks_fts MATCH ?
                            ORDER BY r
                            LIMIT 30
                            """,
                            (and_fts,),
                        )
                        add_rows(cur.fetchall(), boost=12.0)
                    except Exception:
                        pass

                if len(candidates_map) < top_k and safe_kws:
                    or_fts = " OR ".join(f'"{k}"' for k in safe_kws[:8])
                    try:
                        cur.execute(
                            """
                            SELECT doc_id, heading, content, bm25(srs_chunks_fts, 8.0, 5.0, 1.0) AS r
                            FROM srs_chunks_fts
                            WHERE srs_chunks_fts MATCH ?
                            ORDER BY r
                            LIMIT 25
                            """,
                            (or_fts,),
                        )
                        add_rows(cur.fetchall(), boost=0.0)
                    except Exception:
                        pass

        # Pass 4: Cross-Reranking in Python for maximum relevance & zero noise
        q_lower = query.lower()
        asking_appsale = any(w in q_lower for w in ["appsale", "app sale", "cms", "storefront", "gói cước", "tấm gương", "mirror", "quota", "landing"])

        scored_results: List[Dict[str, Any]] = []
        for item in candidates_map.values():
            doc_id = item["doc_id"]
            heading = item["heading"]
            content = item["content"]
            doc_lower = doc_id.lower()
            head_lower = heading.lower()
            body_lower = content.lower()
            combined_lower = f"{doc_lower} {head_lower} {body_lower}"

            score = item["fts_score"]

            # Boost exact ID matches
            for eid in exact_ids:
                if eid in doc_lower or eid in head_lower:
                    score += 60.0
                elif eid in body_lower:
                    score += 40.0

            # Boost matched domain phrases
            for phrase in matched_phrases:
                if phrase in head_lower or phrase in doc_lower:
                    score += 32.0
                elif phrase in body_lower:
                    score += 20.0

            # Keyword coverage
            if keywords:
                matched_kw_count = sum(1 for kw in keywords if kw in combined_lower)
                head_kw_count = sum(1 for kw in keywords if kw in head_lower or kw in doc_lower)
                coverage = matched_kw_count / len(keywords)
                score += coverage * 25.0 + head_kw_count * 6.0

            # Source authority adjustments
            if doc_id.startswith("backend-docs/issues/"):
                score += 18.0
            elif doc_id.startswith("web-docs/"):
                score += 17.0
            elif doc_id.startswith("backend-docs/business_logic/"):
                score += 16.0
            elif doc_id.startswith(("mvl-rules/", "mvl-reference/")):
                score += 15.0
            elif doc_id.startswith("features/") and (doc_id.endswith("brd.md") or doc_id.endswith("fsd.md")):
                score += 14.0
            elif doc_id.startswith("code:erp-backend/"):
                score += 10.0

            # Penalize generic Changelog sections unless explicitly asked
            if "changelog" in head_lower and "changelog" not in q_lower:
                score -= 30.0

            # Penalize unrelated appsale-v1 docs when asking about ERP accounting/HRM/sales
            if not asking_appsale and (doc_id.startswith("appsale-v1/") or doc_id.startswith("code:appsale-backend/")):
                score -= 22.0

            if doc_id.startswith("code:"):
                clean_code_path = doc_id.replace("code:", "")
                citation = f"[Code: {clean_code_path} | {heading}]"
            else:
                citation = f"[Tài liệu: {doc_id} | Đề mục: {heading}]"

            scored_results.append({
                "doc_id": doc_id,
                "heading": heading,
                "content": content,
                "citation": citation,
                "rank": round(score, 2),
                "is_code": doc_id.startswith("code:"),
            })

        scored_results.sort(key=lambda x: x["rank"], reverse=True)

        # Ensure balanced mix of SRS/Business Docs + Code Logic
        doc_chunks = [r for r in scored_results if not r["is_code"] and r["rank"] > 5.0]
        code_chunks = [r for r in scored_results if r["is_code"] and r["rank"] > 5.0]

        if not doc_chunks and not code_chunks:
            return scored_results[:top_k]

        final_results: List[Dict[str, Any]] = []
        max_docs = max(top_k - 3, 4) if include_code else top_k
        final_results.extend(doc_chunks[:max_docs])
        if include_code:
            final_results.extend(code_chunks[:3])

        # Sort final selection by score descending
        final_results.sort(key=lambda x: x["rank"], reverse=True)
        out = final_results[:top_k]
        with self._lock:
            self._search_cache[cache_key] = out
            if len(self._search_cache) > self._max_cache_size:
                self._search_cache.popitem(last=False)
        return out

    def format_context(self, chunks: List[Dict[str, Any]], allow_tech: bool = False) -> str:
        if not chunks:
            return "Không tìm thấy đoạn trích tài liệu SRS trực tiếp liên quan."

        doc_chunks = [c for c in chunks if not c.get("is_code")]
        code_chunks = [c for c in chunks if c.get("is_code")]

        lines: List[str] = []
        if doc_chunks:
            lines.append("=== TRÍCH DẪN TÀI LIỆU SRS & PHÂN TÍCH NGHIỆP VỤ CHÍNH THỨC ===")
            for i, c in enumerate(doc_chunks, start=1):
                lines.append(f"\n--- [Nguồn {i}: {c['citation']}] ---")
                lines.append(c["content"])
            lines.append("\n=== HẾT TRÍCH DẪN TÀI LIỆU ===")

        if code_chunks:
            if allow_tech:
                lines.append("\n=== MÃ NGUỒN & DOCSTRING THỰC TẾ TRONG REPOSITORY (DÙNG CHO CHẾ ĐỘ CHECK CODE) ===")
                for i, c in enumerate(code_chunks, start=1):
                    lines.append(f"\n--- [Code {i}: {c['citation']}] ---")
                    lines.append(c["content"])
                lines.append("\n=== HẾT MÃ NGUỒN ===")
            else:
                lines.append(
                    "\n=== LOGIC HỆ THỐNG THỰC TẾ TRÍCH TỪ CODE (CHỈ DÙNG ĐỂ ĐỐI CHIẾU CHÍNH XÁC NGHIỆP VỤ - TUYỆT ĐỐI KHÔNG TRÍCH DẪN TÊN FILE .py HAY TÊN HÀM RA NGOÀI) ==="
                )
                for i, c in enumerate(code_chunks, start=1):
                    lines.append(f"\n--- [Logic thực tế {i} ({c['heading']})] ---")
                    lines.append(c["content"])
                lines.append("\n=== HẾT LOGIC HỆ THỐNG ===")

        return "\n".join(lines)
