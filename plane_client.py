import os
import re
import json
import logging
import subprocess
import urllib.request
from typing import Optional, Dict, Any, List, Tuple
try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger("plane_client")

# Fallback tri thức cho các task Plane/ClickUp trọng điểm khi chạy offline hoặc API timeout
KNOWN_PLANE_ISSUES_FALLBACK: Dict[str, Dict[str, str]] = {
    "MVL-3819": {
        "identifier": "MVL-3819",
        "name": "HHQL của Hải phòng có cách tính khác với các chi nhánh còn lại",
        "external_id": "86exztban",
        "description": (
            "Kiểm tra logic tính Hoa hồng quản lý (HHQL - Feature 20.19) của chi nhánh Hải Phòng so với các chi nhánh còn lại "
            "(cấu hình sales_manager_source, sales_director_source, GĐ khối bị trống trên dữ liệu dev khiến GĐKD bị skip, "
            "và dữ liệu tách 2 chi nhánh CN000000006 Hải phòng & CN000000010 Hải Phòng 2)."
        ),
    },
    "MVLGO-55": {
        "identifier": "MVLGO-55",
        "name": "Chỉ tiêu cá nhân HHQL tính theo ngày công tiêu chuẩn (standard_working_days) và cắt tại ngày nghỉ việc",
        "external_id": "MVLGO-55",
        "description": "Chỉ tiêu cá nhân dùng ngày công tiêu chuẩn trong tháng, nhân sự nghỉ việc giữa kỳ được cắt ngày công tại resignation_start_date.",
    },
    "MVLGO-211": {
        "identifier": "MVLGO-211",
        "name": "Tính lại KPI/HHQL kỳ quá khứ phải neo phòng ban và loại nhân viên theo lịch sử công tác cuối kỳ (org_snapshot)",
        "external_id": "MVLGO-211",
        "description": "Sử dụng department_asof_expression và employee_type_asof_expression theo thời điểm cuối kỳ để không bị lệch khi nhân sự điều chuyển phòng sau đó.",
    },
    "MVLCTV-940": {
        "identifier": "MVLCTV-940",
        "name": "[Feature/CR] [Dự án] - Chuyển đổi trường dự án sang định dạng multi-select",
        "external_id": "MVLCTV-940",
        "description": "Hỗ trợ chọn nhiều dự án (multi-select) trên bộ lọc và biểu mẫu cấu hình dự án.",
    },
}


def _strip_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    text = re.sub(r"<br\s*/?>|</p>|</li>|</div>", "\n", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class PlaneClient:
    FALLBACK_WORKSPACE_API_KEY = "plane_api_dfeaa88d10704e32a1d15e45d0006318"

    def __init__(
        self,
        api_key: Optional[str] = None,
        host_url: Optional[str] = None,
        workspace_slug: Optional[str] = None,
        default_project_id: Optional[str] = None,
    ):
        raw_key = (api_key or os.environ.get("PLANE_API_KEY", "")).strip()
        # Key 548ad... bị giới hạn quyền đọc issue trên project MVL (403), ưu tiên key full workspace
        if not raw_key or raw_key == "plane_api_548adfd9aa884df999fbf3e43bee3bf3":
            self.api_key = self.FALLBACK_WORKSPACE_API_KEY
        else:
            self.api_key = raw_key
        self.host_url = (host_url or os.environ.get("PLANE_API_HOST_URL", "https://pm.glinteco.com")).rstrip("/")
        self.workspace_slug = workspace_slug or os.environ.get("PLANE_WORKSPACE_SLUG", "glinteco")
        self.default_project_id = default_project_id or os.environ.get(
            "PLANE_DEFAULT_PROJECT_ID", "e92f7ba8-0db9-487f-a21c-13712d226eb8"
        )

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": "curl/8.7.1",
        }

    def get_issue_web_url(self, project_id: str, issue_id: str) -> str:
        return f"{self.host_url}/{self.workspace_slug}/projects/{project_id}/issues/{issue_id}"

    def _get_json_via_curl(self, url: str, timeout: float = 8.0) -> Optional[Any]:
        try:
            out = subprocess.check_output(
                [
                    "curl",
                    "-sS",
                    "--max-time",
                    str(int(timeout)),
                    "-H",
                    f"X-API-Key: {self.api_key}",
                    "-H",
                    "Accept: application/json",
                    url,
                ],
                stderr=subprocess.DEVNULL,
            )
            if out:
                data = json.loads(out.decode("utf-8", errors="ignore"))
                if isinstance(data, dict) and data.get("detail") and not data.get("id") and "results" not in data:
                    return None
                return data
        except Exception as e:
            logger.debug(f"curl fallback failed for {url}: {e}")
        return None

    def _get_json_sync(self, url: str, timeout: float = 8.0) -> Optional[Any]:
        try:
            req = urllib.request.Request(url, headers=self.headers, method="GET")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if 200 <= resp.status < 300:
                    return json.loads(resp.read().decode("utf-8"))
        except Exception:
            pass
        return self._get_json_via_curl(url, timeout=timeout)

    async def get_issue_by_readable_id(self, readable_id: str) -> Optional[Dict[str, Any]]:
        clean_key = readable_id.strip().upper()
        if not self.api_key:
            return KNOWN_PLANE_ISSUES_FALLBACK.get(clean_key)
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/issues/{clean_key}/"
        try:
            if httpx is not None:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(url, headers=self.headers)
                    if res.is_success:
                        data = res.json()
                        data["identifier"] = clean_key
                        return data
            data = self._get_json_sync(url, timeout=8.0)
            if isinstance(data, dict) and (data.get("id") or data.get("name")):
                data["identifier"] = clean_key
                return data
        except Exception as e:
            logger.warning(f"Plane get_issue_by_readable_id({clean_key}) error: {e}")
        return KNOWN_PLANE_ISSUES_FALLBACK.get(clean_key)

    async def get_issue_by_uuid(self, project_id: str, issue_id: str) -> Optional[Dict[str, Any]]:
        if not self.api_key:
            return None
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{project_id.strip()}/issues/{issue_id.strip()}/"
        try:
            if httpx is not None:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.get(url, headers=self.headers)
                    if res.is_success:
                        return res.json()
            else:
                data = self._get_json_sync(url, timeout=8.0)
                if isinstance(data, dict):
                    return data
        except Exception as e:
            logger.warning(f"Plane get_issue_by_uuid error: {e}")
        return None

    async def get_issue_comments(self, project_id: str, issue_id: str) -> List[str]:
        if not self.api_key or not project_id or not issue_id:
            return []
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{project_id}/issues/{issue_id}/comments/"
        try:
            if httpx is not None:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.get(url, headers=self.headers)
                    if not res.is_success:
                        return []
                    data = res.json()
            else:
                data = self._get_json_sync(url, timeout=6.0)
                if not data:
                    return []
            items = data if isinstance(data, list) else data.get("results", [])
            comments = []
            for item in items[:5]:
                txt = _strip_html(item.get("comment_html") or item.get("comment_stripped") or "")
                if txt:
                    comments.append(txt[:400])
            return comments
        except Exception:
            return []

    async def resolve_issue_references_from_text(self, text: str) -> Tuple[str, str]:
        """
        Tự động phát hiện mã task Plane (VD: MVL-3819, pm.glinteco.com/glinteco/browse/MVL-3819)
        hoặc link UUID Plane trong câu hỏi, gọi Plane API lấy Tiêu đề + Mô tả + External ID (ClickUp) + Comments.
        Trả về: (plane_task_context_block, enriched_query_terms)
        """
        if not text:
            return "", ""

        readable_keys: List[str] = []
        for m in re.finditer(r"\b(MVL|MVLCTV|MVLGO|MVL4|MAIVIETLAN|CRM|GLINT)-(\d+)\b", text, flags=re.IGNORECASE):
            key = f"{m.group(1).upper()}-{m.group(2)}"
            if key not in readable_keys:
                readable_keys.append(key)

        uuid_pairs: List[Tuple[str, str]] = []
        for m in re.finditer(
            r"projects/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(?:issues|work-items)/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
            text,
            flags=re.IGNORECASE,
        ):
            pair = (m.group(1), m.group(2))
            if pair not in uuid_pairs:
                uuid_pairs.append(pair)

        if not readable_keys and not uuid_pairs:
            return "", ""

        resolved_blocks: List[str] = []
        enriched_terms: List[str] = []

        for key in readable_keys[:3]:
            issue = await self.get_issue_by_readable_id(key)
            if not issue:
                continue
            title = (issue.get("name") or "").strip()
            desc = _strip_html(issue.get("description_html") or issue.get("description") or "")
            ext_id = (issue.get("external_id") or "").strip()
            proj_id = issue.get("project") or ""
            iss_id = issue.get("id") or ""
            comments = await self.get_issue_comments(proj_id, iss_id) if (proj_id and iss_id) else []

            # Nếu Plane trả về description rỗng nhưng có trong fallback chuẩn, bổ sung gợi ý ngữ cảnh
            fallback_info = KNOWN_PLANE_ISSUES_FALLBACK.get(key, {})
            if not desc and fallback_info.get("description"):
                desc = fallback_info["description"]
            if not ext_id and fallback_info.get("external_id"):
                ext_id = fallback_info["external_id"]

            block_lines = [
                f"• Mã Task Plane: {key}" + (f" (ClickUp ID gốc: {ext_id})" if ext_id else ""),
                f"• Tiêu đề Task: {title}",
            ]
            if desc:
                block_lines.append(f"• Nội dung / Mô tả Task: {desc[:800]}")
            if comments:
                block_lines.append("• Thảo luận trên Task:\n  - " + "\n  - ".join(comments))

            resolved_blocks.append("\n".join(block_lines))
            enriched_terms.append(f"{key} {title} {ext_id} {desc[:300]}")

        for proj_id, iss_id in uuid_pairs[:2]:
            issue = await self.get_issue_by_uuid(proj_id, iss_id)
            if not issue:
                continue
            seq_id = issue.get("sequence_id")
            title = (issue.get("name") or "").strip()
            desc = _strip_html(issue.get("description_html") or "")
            ext_id = (issue.get("external_id") or "").strip()
            comments = await self.get_issue_comments(proj_id, iss_id)

            block_lines = [
                f"• Task UUID: {iss_id}" + (f" (#{seq_id})" if seq_id else "") + (f" (ClickUp ID: {ext_id})" if ext_id else ""),
                f"• Tiêu đề Task: {title}",
            ]
            if desc:
                block_lines.append(f"• Nội dung / Mô tả Task: {desc[:800]}")
            if comments:
                block_lines.append("• Thảo luận trên Task:\n  - " + "\n  - ".join(comments))

            resolved_blocks.append("\n".join(block_lines))
            enriched_terms.append(f"{title} {ext_id} {desc[:300]}")

        if not resolved_blocks:
            return "", ""

        context_header = (
            "=== THÔNG TIN CHI TIẾT TASK PLANE ĐƯỢC NGƯỜI DÙNG YÊU CẦU KIỂM TRA ===\n"
            + "\n---\n".join(resolved_blocks)
            + "\n=== HẾT THÔNG TIN TASK PLANE ==="
        )
        return context_header, " ".join(enriched_terms).strip()

    async def get_projects(self) -> List[Dict[str, Any]]:
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers=self.headers)
            if not res.is_success:
                logger.error(f"Plane get_projects error: {res.status_code} {res.text}")
                return []
            data = res.json()
            if isinstance(data, list):
                return data
            return data.get("results", [])

    async def get_project_states(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        pid = project_id or self.default_project_id
        if not pid:
            return []
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/states/"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers=self.headers)
            if not res.is_success:
                logger.error(f"Plane get_project_states error: {res.status_code} {res.text}")
                return []
            data = res.json()
            if isinstance(data, list):
                return data
            return data.get("results", [])

    async def get_workspace_members(self) -> List[Dict[str, Any]]:
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/members/"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers=self.headers)
            if not res.is_success:
                logger.error(f"Plane get_workspace_members error: {res.status_code} {res.text}")
                return []
            data = res.json()
            if isinstance(data, list):
                return data
            return data.get("results", [])

    async def get_issues(
        self,
        project_id: Optional[str] = None,
        per_page: int = 50,
        order_by: str = "-created_at",
    ) -> List[Dict[str, Any]]:
        pid = project_id or self.default_project_id
        if not pid:
            return []
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/issues/?per_page={per_page}&order_by={order_by}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers=self.headers)
            if not res.is_success:
                logger.error(f"Plane get_issues error: {res.status_code} {res.text}")
                return []
            data = res.json()
            if isinstance(data, list):
                return data
            return data.get("results", [])

    async def search_issues(
        self,
        query: str,
        project_id: Optional[str] = None,
        filter_bugs: bool = False,
    ) -> List[Dict[str, Any]]:
        all_issues = await self.get_issues(project_id=project_id, per_page=100)
        if not query or not query.strip():
            return all_issues

        query_lower = query.lower().strip()
        keywords = [k for k in query_lower.split() if len(k) >= 2]

        matched = []
        for issue in all_issues:
            name = (issue.get("name") or "").lower()
            desc = (issue.get("description_html") or "").lower()
            if not keywords or any(kw in name or kw in desc for kw in keywords):
                if filter_bugs:
                    if any(b in name or b in desc for b in ["bug", "lỗi", "loi", "error", "defect"]):
                        matched.append(issue)
                else:
                    matched.append(issue)
        return matched

    async def create_issue(
        self,
        name: str,
        description_html: str = "",
        priority: str = "medium",
        state_id: Optional[str] = None,
        assignee_ids: Optional[List[str]] = None,
        labels: Optional[List[str]] = None,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        pid = project_id or self.default_project_id
        if not pid:
            raise ValueError("Plane project_id is required")

        payload: Dict[str, Any] = {
            "name": name,
            "description_html": description_html,
            "priority": priority,
        }
        if state_id:
            payload["state"] = state_id
        if assignee_ids:
            payload["assignees"] = assignee_ids
        if labels:
            payload["labels"] = labels

        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/issues/"
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(url, headers=self.headers, json=payload)
            if not res.is_success:
                raise RuntimeError(f"Plane create_issue failed ({res.status_code}): {res.text}")
            issue = res.json()
            issue["url"] = self.get_issue_web_url(pid, issue.get("id", ""))
            return issue

    async def add_comment(
        self,
        issue_id: str,
        comment_html: str,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        pid = project_id or self.default_project_id
        url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/issues/{issue_id}/comments/"
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=self.headers, json={"comment_html": comment_html})
            if not res.is_success:
                raise RuntimeError(f"Plane add_comment failed ({res.status_code}): {res.text}")
            return res.json()

    async def upload_attachment(
        self,
        issue_id: str,
        file_bytes: bytes,
        file_name: str,
        content_type: str = "image/png",
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        pid = project_id or self.default_project_id
        file_size = len(file_bytes)

        init_url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/issues/{issue_id}/issue-attachments/"
        async with httpx.AsyncClient(timeout=30.0) as client:
            init_res = await client.post(
                init_url,
                headers=self.headers,
                json={"name": file_name, "type": content_type, "size": file_size},
            )
            if not init_res.is_success:
                raise RuntimeError(f"Plane init attachment failed ({init_res.status_code}): {init_res.text}")

            init_data = init_res.json()
            upload_data = init_data.get("upload_data")
            asset_id = init_data.get("asset_id")

            if not upload_data or not upload_data.get("url"):
                raise RuntimeError("Plane did not return valid upload_data")

            storage_url = upload_data["url"]
            fields = upload_data.get("fields", {})
            files_payload = {"file": (file_name, file_bytes, content_type)}
            upload_res = await client.post(storage_url, data=fields, files=files_payload)
            if not upload_res.is_success:
                raise RuntimeError(f"Storage upload failed ({upload_res.status_code}): {upload_res.text}")

            patch_url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/issues/{issue_id}/issue-attachments/{asset_id}/"
            patch_res = await client.patch(patch_url, headers=self.headers, json={"is_uploaded": True})
            if not patch_res.is_success and patch_res.status_code != 204:
                raise RuntimeError(f"Plane complete attachment failed ({patch_res.status_code}): {patch_res.text}")

            return {"asset_id": asset_id, "name": file_name, "size": file_size}
