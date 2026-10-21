import os
import sqlite3
import re
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("rag_engine")

class SRSRagEngine:
    def __init__(self, db_path: Optional[str] = None):
        if not db_path:
            possible_paths = [
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "srs_fts.db"),
                "/mnt/D/Work/MVL/slackbot/srs_fts.db",
                "/app/srs_fts.db",
            ]
            for p in possible_paths:
                if os.path.exists(p):
                    db_path = p
                    break
        self.db_path = db_path or "srs_fts.db"
        logger.info(f"Using SRS FTS DB at: {self.db_path}")

    def is_ready(self) -> bool:
        return os.path.exists(self.db_path)

    def get_stats(self) -> Dict[str, Any]:
        if not self.is_ready():
            return {"ready": False, "chunks": 0, "size_mb": 0}
        try:
            conn = sqlite3.connect(self.db_path)
            cur = conn.cursor()
            cur.execute("SELECT count(*) FROM srs_chunks")
            count = cur.fetchone()[0]
            conn.close()
            size_mb = os.path.getsize(self.db_path) / (1024 * 1024)
            return {"ready": True, "chunks": count, "size_mb": round(size_mb, 2)}
        except Exception as e:
            logger.error(f"Error reading stats: {e}")
            return {"ready": False, "error": str(e)}

    def search(self, query: str, top_k: int = 6) -> List[Dict[str, Any]]:
        if not self.is_ready():
            logger.warning("SRS FTS DB does not exist, cannot perform search.")
            return []

        # Sanitize query for FTS5
        clean_text = re.sub(r'[^\w\s]', ' ', query, flags=re.UNICODE).strip()
        words = [w for w in clean_text.split() if len(w) > 1]
        if not words:
            return []

        # Try prefix matching and OR matching
        # e.g. "hợp* OR đồng* OR đặt* OR cọc*"
        fts_query = " OR ".join(words)

        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        results = []

        try:
            sql = """
                SELECT doc_id, heading, content, rank
                FROM srs_chunks_fts
                WHERE srs_chunks_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """
            cur.execute(sql, (fts_query, top_k))
            rows = cur.fetchall()
            for r in rows:
                doc_id, heading, content, rank = r[0], r[1], r[2], r[3]
                results.append({
                    "doc_id": doc_id,
                    "heading": heading,
                    "content": content,
                    "citation": f"[Tài liệu: {doc_id} | Đề mục: {heading}]",
                    "rank": rank,
                })
        except Exception as e:
            logger.error(f"FTS5 MATCH error with query '{fts_query}': {e}")
            # Fallback simple LIKE search
            try:
                like_term = f"%{words[0]}%"
                fallback_sql = """
                    SELECT doc_id, heading, content, 0.0
                    FROM srs_chunks
                    WHERE content LIKE ? OR heading LIKE ?
                    LIMIT ?
                """
                cur.execute(fallback_sql, (like_term, like_term, top_k))
                rows = cur.fetchall()
                for r in rows:
                    results.append({
                        "doc_id": r[0],
                        "heading": r[1],
                        "content": r[2],
                        "citation": f"[Tài liệu: {r[0]} | Đề mục: {r[1]}]",
                        "rank": 0.0,
                    })
            except Exception as fe:
                logger.error(f"Fallback search error: {fe}")
        finally:
            conn.close()

        return results

    def format_context(self, chunks: List[Dict[str, Any]]) -> str:
        if not chunks:
            return "Không tìm thấy đoạn trích tài liệu SRS trực tiếp liên quan."

        lines = ["=== TRÍCH DẪN TÀI LIỆU SRS CHÍNH THỨC CỦA DỰ ÁN MAIVIETLAND ==="]
        for i, c in enumerate(chunks, start=1):
            lines.append(f"\n--- [Nguồn {i}: {c['citation']}] ---")
            lines.append(c["content"])
        lines.append("\n=== HẾT TRÍCH DẪN ===")
        return "\n".join(lines)
