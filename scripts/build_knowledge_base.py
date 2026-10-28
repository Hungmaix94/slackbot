#!/usr/bin/env python3
"""
Build Full-Spectrum Knowledge Base (srs_fts.db + srs_fts.db.gz) for MVL Slack Assistant.
Ingests:
1. /Users/phamhung/D/Work/MVL/srs/docs (All Official SRS, BRD, FSD, Test Specs, Plans, Handover)
2. /Users/phamhung/D/Work/MVL/erp-repo/backend/docs (Business Logic, Issue Root-Cause Analyses, Architects, Plans)
3. /Users/phamhung/D/Work/MVL/erp-repo/backend/apps (ERP Backend Python Services, Models, Rules, Constants, Exceptions, Views, Serializers)
4. /Users/phamhung/D/Work/MVL/app-sale/backend/apps (AppSale Backend Python Services, Models, Views, Serializers)
5. /Users/phamhung/D/Work/MVL/_bmad-output (BMAD Architecture, PRD, Stories)
"""

import ast
import gzip
import os
import re
import shutil
import sqlite3
from pathlib import Path
from typing import List, Tuple

ROOT_MVL = Path("/Users/phamhung/D/Work/MVL")
SLACKBOT_DIR = ROOT_MVL / "slackbot"
DB_PATH = SLACKBOT_DIR / "srs_fts.db"
GZ_PATH = SLACKBOT_DIR / "srs_fts.db.gz"

MAX_CHUNK_CHARS = 2400
MIN_CHUNK_CHARS = 80


def split_markdown_into_chunks(doc_id: str, text: str) -> List[Tuple[str, str, str]]:
    """Split markdown file by headings (#, ##, ###, ####) into semantic chunks."""
    lines = text.splitlines()
    chunks: List[Tuple[str, str, str]] = []

    doc_title = doc_id
    for line in lines[:15]:
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            doc_title = m.group(1).strip()
            break

    current_heading = doc_title
    current_lines: List[str] = []

    def flush_section(heading: str, section_lines: List[str]):
        body = "\n".join(section_lines).strip()
        if len(body) < MIN_CHUNK_CHARS:
            return
        if len(body) <= MAX_CHUNK_CHARS:
            chunks.append((doc_id, heading, body))
        else:
            # Split by paragraphs
            paras = body.split("\n\n")
            buf: List[str] = []
            buf_len = 0
            part = 1
            for p in paras:
                if buf_len + len(p) > MAX_CHUNK_CHARS and buf:
                    h = f"{heading} (Phần {part})" if part > 1 else heading
                    chunks.append((doc_id, h, "\n\n".join(buf).strip()))
                    part += 1
                    buf = [p]
                    buf_len = len(p)
                else:
                    buf.append(p)
                    buf_len += len(p) + 2
            if buf:
                h = f"{heading} (Phần {part})" if part > 1 else heading
                chunks.append((doc_id, h, "\n\n".join(buf).strip()))

    for line in lines:
        heading_match = re.match(r"^(#{1,4})\s+(.+)$", line.strip())
        if heading_match:
            if current_lines:
                flush_section(current_heading, current_lines)
            raw_h = heading_match.group(2).strip()
            if raw_h != doc_title:
                current_heading = f"{doc_title} > {raw_h}"
            else:
                current_heading = raw_h
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        flush_section(current_heading, current_lines)

    return chunks


def extract_python_code_chunks(rel_doc_id: str, file_path: Path) -> List[Tuple[str, str, str]]:
    """
    Extract rich business & technical knowledge chunks from Python source files:
    - Module docstring + top-level constants/rules
    - Classes (Models, Serializers, Views, Services, TextChoices) with docstrings + key body lines
    - Functions/Methods with docstrings + business logic implementation
    """
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []

    if len(source.strip()) < MIN_CHUNK_CHARS:
        return []

    chunks: List[Tuple[str, str, str]] = []
    lines = source.splitlines()

    try:
        tree = ast.parse(source)
    except SyntaxError:
        # Fallback plain chunking if AST fails
        snippet = "\n".join(lines[:120]).strip()
        if len(snippet) >= MIN_CHUNK_CHARS:
            chunks.append((rel_doc_id, f"Module {file_path.name}", snippet[:MAX_CHUNK_CHARS]))
        return chunks

    module_doc = ast.get_docstring(tree) or ""
    # Collect top-level assignments (constants, rules, error codes)
    top_assigns: List[str] = []
    for node in tree.body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            start = node.lineno - 1
            end = min(getattr(node, "end_lineno", node.lineno), start + 25)
            seg = "\n".join(lines[start:end]).strip()
            if seg and not seg.startswith("logger"):
                top_assigns.append(seg)

    if module_doc or top_assigns:
        header_parts = []
        if module_doc:
            header_parts.append(f"Mô tả module ({rel_doc_id}):\n{module_doc}")
        if top_assigns:
            header_parts.append("Hằng số & Quy tắc cấu hình:\n" + "\n".join(top_assigns[:20]))
        combined = "\n\n".join(header_parts).strip()
        if len(combined) >= MIN_CHUNK_CHARS:
            chunks.append((rel_doc_id, f" Tổng quan & Hằng số ({file_path.name})", combined[:MAX_CHUNK_CHARS]))

    # Extract classes and top-level functions
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            cls_name = node.name
            cls_doc = ast.get_docstring(node) or ""
            start_line = node.lineno
            end_line = getattr(node, "end_lineno", start_line + 80)
            cls_src = "\n".join(lines[start_line - 1 : min(end_line, start_line + 110)])
            heading = f"Class {cls_name} ({file_path.name}:L{start_line}-L{end_line})"
            content = f"Vị trí: {rel_doc_id}:L{start_line}-L{end_line}\n"
            if cls_doc:
                content += f"Ý nghĩa nghiệp vụ / Docstring:\n{cls_doc}\n\n"
            content += f"Mã nguồn chi tiết:\n{cls_src}"
            chunks.append((rel_doc_id, heading, content[:MAX_CHUNK_CHARS]))

            # Also index important methods with docstrings or business logic inside large classes
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    m_doc = ast.get_docstring(sub) or ""
                    m_start = sub.lineno
                    m_end = getattr(sub, "end_lineno", m_start + 50)
                    if m_doc or (m_end - m_start >= 12) or sub.name.startswith(("validate", "compute", "resolve", "approve", "create", "cancel", "recompute", "check")):
                        m_src = "\n".join(lines[m_start - 1 : min(m_end, m_start + 80)])
                        m_heading = f"{cls_name}.{sub.name} ({file_path.name}:L{m_start}-L{m_end})"
                        m_content = f"Vị trí: {rel_doc_id}:L{m_start}-L{m_end}\nHàm: {cls_name}.{sub.name}\n"
                        if m_doc:
                            m_content += f"Giải thích logic:\n{m_doc}\n\n"
                        m_content += f"Chi tiết thực thi:\n{m_src}"
                        chunks.append((rel_doc_id, m_heading, m_content[:MAX_CHUNK_CHARS]))

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            fn_name = node.name
            fn_doc = ast.get_docstring(node) or ""
            f_start = node.lineno
            f_end = getattr(node, "end_lineno", f_start + 60)
            f_src = "\n".join(lines[f_start - 1 : min(f_end, f_start + 95)])
            heading = f"Hàm {fn_name} ({file_path.name}:L{f_start}-L{f_end})"
            content = f"Vị trí: {rel_doc_id}:L{f_start}-L{f_end}\nHàm: {fn_name}\n"
            if fn_doc:
                content += f"Ý nghĩa nghiệp vụ & Logic:\n{fn_doc}\n\n"
            content += f"Mã nguồn thực thi:\n{f_src}"
            chunks.append((rel_doc_id, heading, content[:MAX_CHUNK_CHARS]))

    return chunks


def should_index_python_file(path: Path) -> bool:
    parts = path.parts
    if any(p in ("migrations", "tests", "__pycache__", ".venv", "venv", "node_modules", "management") for p in parts):
        return False
    if path.name == "__init__.py" and path.stat().st_size < 200:
        return False
    return True


def build_database():
    print("🚀 Bắt đầu nạp toàn bộ tri thức từ SRS + Backend Docs + ERP Code + AppSale Code...")
    all_chunks: List[Tuple[str, str, str]] = []

    # 1. Official SRS Repository (/Users/phamhung/D/Work/MVL/srs/docs)
    srs_docs_dir = ROOT_MVL / "srs" / "docs"
    srs_count = 0
    if srs_docs_dir.exists():
        for md_file in sorted(srs_docs_dir.rglob("*.md")):
            if "archived" in md_file.parts:
                continue
            rel_id = str(md_file.relative_to(srs_docs_dir))
            text = md_file.read_text(encoding="utf-8", errors="ignore")
            file_chunks = split_markdown_into_chunks(rel_id, text)
            all_chunks.extend(file_chunks)
            srs_count += len(file_chunks)
    print(f"  ✓ [1/5] SRS Chính thức (srs/docs): {srs_count} chunks")

    # 2. ERP Backend Docs (/Users/phamhung/D/Work/MVL/erp-repo/backend/docs)
    # Includes business_logic/, issues/ (e.g. 86exztban / MVL-3819), architects/, plans/, integration/, tech_debts/
    be_docs_dir = ROOT_MVL / "erp-repo" / "backend" / "docs"
    be_docs_count = 0
    if be_docs_dir.exists():
        for md_file in sorted(be_docs_dir.rglob("*.md")):
            if "_archive" in md_file.parts or "features" in md_file.parts:
                # features is a symlink to srs/docs/features
                continue
            rel_id = "backend-docs/" + str(md_file.relative_to(be_docs_dir))
            text = md_file.read_text(encoding="utf-8", errors="ignore")
            file_chunks = split_markdown_into_chunks(rel_id, text)
            all_chunks.extend(file_chunks)
            be_docs_count += len(file_chunks)
    print(f"  ✓ [2/5] Tài liệu Phân tích Nghiệp vụ, Issues & Kiến trúc Backend (erp-repo/backend/docs): {be_docs_count} chunks")

    # 3. ERP Backend Source Code (/Users/phamhung/D/Work/MVL/erp-repo/backend/apps)
    erp_apps_dir = ROOT_MVL / "erp-repo" / "backend" / "apps"
    erp_code_count = 0
    if erp_apps_dir.exists():
        for py_file in sorted(erp_apps_dir.rglob("*.py")):
            if not should_index_python_file(py_file):
                continue
            rel_id = "code:erp-backend/apps/" + str(py_file.relative_to(erp_apps_dir))
            py_chunks = extract_python_code_chunks(rel_id, py_file)
            all_chunks.extend(py_chunks)
            erp_code_count += len(py_chunks)
    print(f"  ✓ [3/5] Mã nguồn & Docstring Nghiệp vụ ERP Backend (erp-repo/backend/apps): {erp_code_count} chunks")

    # 4. AppSale Backend Source Code & Docs (/Users/phamhung/D/Work/MVL/app-sale/backend/apps)
    appsale_apps_dir = ROOT_MVL / "app-sale" / "backend" / "apps"
    appsale_code_count = 0
    if appsale_apps_dir.exists():
        for py_file in sorted(appsale_apps_dir.rglob("*.py")):
            if not should_index_python_file(py_file):
                continue
            rel_id = "code:appsale-backend/apps/" + str(py_file.relative_to(appsale_apps_dir))
            py_chunks = extract_python_code_chunks(rel_id, py_file)
            all_chunks.extend(py_chunks)
            appsale_code_count += len(py_chunks)
    appsale_docs_dir = ROOT_MVL / "app-sale" / "docs"
    if appsale_docs_dir.exists():
        for md_file in sorted(appsale_docs_dir.rglob("*.md")):
            rel_id = "appsale-docs/" + str(md_file.relative_to(appsale_docs_dir))
            text = md_file.read_text(encoding="utf-8", errors="ignore")
            file_chunks = split_markdown_into_chunks(rel_id, text)
            all_chunks.extend(file_chunks)
            appsale_code_count += len(file_chunks)
    print(f"  ✓ [4/5] Mã nguồn & Tài liệu AppSale Backend (app-sale/backend/apps): {appsale_code_count} chunks")

    # 5. BMAD Output & Root SRS Changelogs
    bmad_dir = ROOT_MVL / "_bmad-output"
    bmad_count = 0
    if bmad_dir.exists():
        for md_file in sorted(bmad_dir.rglob("*.md")):
            rel_id = "bmad-specs/" + str(md_file.relative_to(bmad_dir))
            text = md_file.read_text(encoding="utf-8", errors="ignore")
            file_chunks = split_markdown_into_chunks(rel_id, text)
            all_chunks.extend(file_chunks)
            bmad_count += len(file_chunks)
    print(f"  ✓ [5/6] Đặc tả BMAD & Stories (_bmad-output): {bmad_count} chunks")

    # 6. ERP Web Domain Docs & MVL Environment / Test Accounts Playbooks
    web_docs_dir = ROOT_MVL / "erp-repo" / "web" / "docs"
    web_env_count = 0
    if web_docs_dir.exists():
        for md_file in sorted(web_docs_dir.rglob("*.md")):
            rel_id = "web-docs/" + str(md_file.relative_to(web_docs_dir))
            text = md_file.read_text(encoding="utf-8", errors="ignore")
            file_chunks = split_markdown_into_chunks(rel_id, text)
            all_chunks.extend(file_chunks)
            web_env_count += len(file_chunks)

    for extra_dir, prefix in [
        (ROOT_MVL / ".agents" / "rules", "mvl-rules/"),
        (ROOT_MVL / ".agents" / "reference", "mvl-reference/"),
    ]:
        if extra_dir.exists():
            for md_file in sorted(extra_dir.rglob("*.md")):
                rel_id = prefix + str(md_file.relative_to(extra_dir))
                text = md_file.read_text(encoding="utf-8", errors="ignore")
                file_chunks = split_markdown_into_chunks(rel_id, text)
                all_chunks.extend(file_chunks)
                web_env_count += len(file_chunks)
    print(f"  ✓ [6/6] Tài liệu Giao diện ERP Web (erp-repo/web/docs) & Cấu hình Môi trường/Tài khoản Test: {web_env_count} chunks")

    print(f"\n📦 Tổng số chunks tri thức thu thập được: {len(all_chunks):,} chunks")

    # Rebuild SQLite FTS5 database
    tmp_db = SLACKBOT_DIR / "srs_fts_new.db"
    if tmp_db.exists():
        tmp_db.unlink()

    conn = sqlite3.connect(str(tmp_db))
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = OFF;")
    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("CREATE TABLE srs_chunks (id INTEGER PRIMARY KEY, doc_id TEXT, heading TEXT, content TEXT);")
    cur.execute("CREATE INDEX idx_srs_chunks_doc_id ON srs_chunks(doc_id);")
    cur.execute(
        "CREATE VIRTUAL TABLE srs_chunks_fts USING fts5(doc_id, heading, content, content='srs_chunks', content_rowid='id', tokenize='unicode61');"
    )

    cur.executemany(
        "INSERT INTO srs_chunks (doc_id, heading, content) VALUES (?, ?, ?);",
        all_chunks,
    )
    cur.execute("INSERT INTO srs_chunks_fts(srs_chunks_fts) VALUES('rebuild');")
    conn.commit()
    cur.execute("VACUUM;")
    conn.commit()
    conn.close()

    if DB_PATH.exists():
        DB_PATH.unlink()
    tmp_db.rename(DB_PATH)

    db_size_mb = DB_PATH.stat().st_size / (1024 * 1024)
    print(f"✅ Đã lưu cơ sở dữ liệu FTS5: {DB_PATH} ({db_size_mb:.2f} MB)")

    # Also create compressed archive srs_fts.db.gz for fast container/git distribution
    with open(DB_PATH, "rb") as f_in, gzip.open(GZ_PATH, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)
    gz_size_mb = GZ_PATH.stat().st_size / (1024 * 1024)
    print(f"✅ Đã nén bản dự phòng: {GZ_PATH} ({gz_size_mb:.2f} MB)")


if __name__ == "__main__":
    build_database()
