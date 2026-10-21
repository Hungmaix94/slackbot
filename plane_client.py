import os
import json
import logging
import httpx
from typing import Optional, Dict, Any, List

logger = logging.getLogger("plane_client")

class PlaneClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        host_url: Optional[str] = None,
        workspace_slug: Optional[str] = None,
        default_project_id: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("PLANE_API_KEY", "")
        self.host_url = (host_url or os.environ.get("PLANE_API_HOST_URL", "https://pm.glinteco.com")).rstrip("/")
        self.workspace_slug = workspace_slug or os.environ.get("PLANE_WORKSPACE_SLUG", "glinteco")
        self.default_project_id = default_project_id or os.environ.get("PLANE_DEFAULT_PROJECT_ID", "")

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def get_issue_web_url(self, project_id: str, issue_id: str) -> str:
        return f"{self.host_url}/{self.workspace_slug}/projects/{project_id}/issues/{issue_id}"

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

        # 1. Khởi tạo attachment & lấy pre-signed URL
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

            # 2. Upload tệp nhị phân lên Object Storage
            storage_url = upload_data["url"]
            fields = upload_data.get("fields", {})
            files_payload = {"file": (file_name, file_bytes, content_type)}
            upload_res = await client.post(storage_url, data=fields, files=files_payload)
            if not upload_res.is_success:
                raise RuntimeError(f"Storage upload failed ({upload_res.status_code}): {upload_res.text}")

            # 3. Đánh dấu hoàn tất attachment trên Plane
            patch_url = f"{self.host_url}/api/v1/workspaces/{self.workspace_slug}/projects/{pid}/issues/{issue_id}/issue-attachments/{asset_id}/"
            patch_res = await client.patch(patch_url, headers=self.headers, json={"is_uploaded": True})
            if not patch_res.is_success and patch_res.status_code != 204:
                raise RuntimeError(f"Plane complete attachment failed ({patch_res.status_code}): {patch_res.text}")

            return {"asset_id": asset_id, "name": file_name, "size": file_size}
