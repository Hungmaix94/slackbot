"""
Canonical Multi-Tier Environment Registry & Chrome DevTools MCP Helper for MVL AI Agent.
Provides:
  - 4-Tier Environment Map (Tier 0 Local, Tier 1 Dev Glinteco & Railway Cloud, Tier 2 Staging UAT, Tier 3 Production)
  - Verified Test Accounts & Scope Matrix (admin superuser + branch/project scoped accounts)
  - Frontend Route -> SRS Feature, Component, API Endpoint & Plane Task resolver
  - Live JWT Token Minter & Chrome DevTools MCP navigation/script generator (`build_chrome_mcp_context`)
"""

import os
import re
import time
import json
import logging
import urllib.request
from urllib.parse import urlparse
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("env_config")

# =====================================================================
# 1. BẢN ĐỒ 4 TIER MÔI TRƯỜNG HỆ SINH THÁI MVL (SSOT)
# =====================================================================

MVL_ENVIRONMENTS: Dict[str, Dict[str, Any]] = {
    "tier_0_local": {
        "tier": 0,
        "name": "Local Development (Máy Dev / Sandbox)",
        "safe_for_automation": True,
        "services": {
            "erp_web": os.environ.get("MVL_LOCAL_ERP_WEB_URL", "http://localhost:3000"),
            "erp_api": os.environ.get("MVL_LOCAL_ERP_API_URL", "http://127.0.0.1:8000"),
            "appsale_api": os.environ.get("MVL_LOCAL_APPSALE_API_URL", "http://127.0.0.1:8001"),
            "host_app": os.environ.get("MVL_LOCAL_HOST_APP_URL", "http://localhost:3006"),
            "cms_admin": os.environ.get("MVL_LOCAL_CMS_ADMIN_URL", "http://localhost:3005"),
            "crm": os.environ.get("MVL_LOCAL_CRM_URL", "http://localhost:3002"),
            "appsale_storefront": os.environ.get("MVL_LOCAL_APPSALE_WEB_URL", "http://localhost:3003"),
            "railway_pg_tunnel": "127.0.0.1:5434",
        },
        "notes": "Khi test AppSale/CMS bắt buộc đi qua Host-App Shell (http://localhost:3006), cấm test trực tiếp trên port 3003.",
    },
    "tier_1_dev_glinteco": {
        "tier": 1,
        "name": "Internal Dev — Cụm Glinteco (*.glinteco.com)",
        "safe_for_automation": True,
        "services": {
            "erp_web": os.environ.get("MVL_DEV_WEB_URL", "https://mvl.glinteco.com"),
            "erp_api": os.environ.get("MVL_DEV_API_URL", "https://api.mvl.glinteco.com"),
            "django_admin": "https://api.mvl.glinteco.com/admin/",
            "login_api": "https://api.mvl.glinteco.com/api/auth/login/",
            "permissions_api": "https://api.mvl.glinteco.com/api/me/permissions/",
        },
        "notes": (
            "Môi trường deploy nhánh dev cho team nội bộ test và dùng Chrome MCP / Playwright chụp ảnh nghiệm thu. "
            "Lưu ý: /api/ trên mvl.glinteco.com bị SPA nuốt trả về HTML, bắt buộc gọi API qua https://api.mvl.glinteco.com."
        ),
    },
    "tier_1_railway_dev": {
        "tier": 1,
        "name": "Internal Dev / Preview Phase 3 — Cụm Railway Cloud (*.up.railway.app)",
        "safe_for_automation": True,
        "railway_project_id": "72ce334c-a3d1-4968-89a4-3f0883da842e",
        "railway_environment_id": "f8b1a957-ed5f-43d6-b324-f0f215b374ec",
        "services": {
            "erp_web": os.environ.get("MVL_RAILWAY_ERP_WEB_URL", "https://erp-web-production-bb1f.up.railway.app"),
            "erp_api": os.environ.get("MVL_RAILWAY_ERP_API_URL", "https://erp-backend-production-484d.up.railway.app"),
            "erp_docs": "https://erp-backend-production-484d.up.railway.app/docs/",
            "appsale_api": os.environ.get("MVL_RAILWAY_APPSALE_API_URL", "https://app-sale-backend-production.up.railway.app"),
            "host_app": os.environ.get("MVL_RAILWAY_HOST_APP_URL", "https://host-app-production.up.railway.app"),
            "cms_admin": os.environ.get("MVL_RAILWAY_CMS_ADMIN_URL", "https://cmsadmin-production-7b06.up.railway.app"),
            "crm": os.environ.get("MVL_RAILWAY_CRM_URL", "https://crm-production-0da1.up.railway.app"),
            "appsale_storefront": os.environ.get("MVL_RAILWAY_APPSALE_WEB_URL", "https://appsale-production.up.railway.app"),
            "slack_agent": os.environ.get("MVL_SLACK_AGENT_URL", "https://mvl-slack-agent-dev.up.railway.app"),
            "rabbitmq": "https://rabbitmq-production-be3e.up.railway.app",
        },
        "notes": "Mọi tên miền *-production-*.up.railway.app trên Railway đều là môi trường Dev/Preview, an toàn để Chrome MCP kiểm thử.",
    },
    "tier_2_staging": {
        "tier": 2,
        "name": "Client Staging / UAT (*.staging.mvl.glinteco.com)",
        "safe_for_automation": True,
        "services": {
            "erp_web": os.environ.get("MVL_STAGING_WEB_URL", "https://mvl.staging.mvl.glinteco.com"),
            "erp_api": os.environ.get("MVL_STAGING_API_URL", "https://api.staging.mvl.glinteco.com"),
        },
        "notes": "Môi trường UAT dành cho khách hàng kiểm thử nghiệm thu.",
    },
    "tier_3_production": {
        "tier": 3,
        "name": "Production Thật (*.maivietland.vn — Self-hosted EC2/VPS)",
        "safe_for_automation": False,
        "services": {
            "erp_web": os.environ.get("MVL_PROD_ERP_WEB_URL", "https://erp.maivietland.vn"),
            "portal_web": os.environ.get("MVL_PROD_PORTAL_URL", "https://portal.maivietland.vn"),
            "public_web": os.environ.get("MVL_PROD_PUBLIC_URL", "https://maivietland.vn"),
            "erp_api": os.environ.get("MVL_PROD_API_URL", "https://api.maivietland.vn"),
            "api_gateway": os.environ.get("MVL_PROD_API_GATEWAY_URL", "https://api-gateway.maivietland.vn"),
        },
        "notes": (
            "Hệ thống Production đang phục vụ người dùng thật. CẤM tạo/sửa/xóa dữ liệu trực tiếp. "
            "Khi người dùng gửi URL erp.maivietland.vn/<route>, Agent dùng Chrome MCP để kiểm tra đối chiếu giao diện trên Tier 1 (mvl.glinteco.com hoặc erp-web-production-bb1f.up.railway.app) cùng route."
        ),
    },
    "plane_tracker": {
        "tier": 1,
        "name": "Plane Issue Tracker (pm.glinteco.com)",
        "safe_for_automation": True,
        "services": {
            "host_url": os.environ.get("PLANE_API_HOST_URL", "https://pm.glinteco.com"),
            "workspace_slug": os.environ.get("PLANE_WORKSPACE_SLUG", "glinteco"),
            "projects": {
                "MVL": "ef79ee12-dbe4-415a-bc9f-6cf91ba944f2",
                "MVLGO": "51d54abd-bb88-41de-b7f9-c9b335c34dda",
                "MAIVIETLAN": "87148fce-00c3-42c4-9369-a7af6cb9cc50",
                "MVLCTV": "e92f7ba8-0db9-487f-a21c-13712d226eb8",
                "MVL4": "3d7e5ccd-6e4d-4c0a-a958-b959d55ce956",
            },
        },
        "notes": "Hệ thống quản lý task/bug tập trung (thay thế ClickUp).",
    },
}

# =====================================================================
# 2. DANH SÁCH TÀI KHOẢN TEST CHUẨN CHO CHROME MCP & PLAYWRIGHT
# =====================================================================

DEFAULT_TEST_PASSWORD = os.environ.get("MVL_TEST_PASSWORD", "Demo123!@#")

MVL_TEST_ACCOUNTS: List[Dict[str, str]] = [
    {
        "username": os.environ.get("MVL_TEST_USERNAME", "admin"),
        "password": DEFAULT_TEST_PASSWORD,
        "role": "Superuser / GDCN (Full quyền toàn hệ thống)",
        "scope": "Không giới hạn (Toàn bộ 16 chi nhánh & mọi phân hệ Kế toán/HRM/Bán hàng)",
        "usage": "Dùng mặc định cho Chrome MCP để mở thẳng mọi URL sâu (/accounting/*, /sales/*, /org-chart/*) không bị chặn 403.",
    },
    {
        "username": "0300622217",
        "password": DEFAULT_TEST_PASSWORD,
        "role": "VT000000060 (Giới hạn 4 chi nhánh)",
        "scope": "4 chi nhánh: CN000000005 Hà Nội, CN000000008 Hưng Yên, CN000000009 Hà Nam, CN000000013 Thái Nguyên",
        "usage": "Kiểm thử phân quyền danh sách bị lọc theo phạm vi chi nhánh.",
    },
    {
        "username": "0900124966",
        "password": DEFAULT_TEST_PASSWORD,
        "role": "VT000000086 (Giới hạn 1 chi nhánh + Tuyển dụng)",
        "scope": "1 chi nhánh: CN000000011 Quảng Ninh (+ recruitment_request.create)",
        "usage": "Kiểm thử truy cập chi nhánh ngoài phạm vi và dropdown chọn nhanh không áp data scope.",
    },
    {
        "username": "0700124595",
        "password": DEFAULT_TEST_PASSWORD,
        "role": "Đỗ Thu Hoài — Thư ký Kinh doanh (TKKD) / Thư ký Dự án (TKDA)",
        "scope": "Giới hạn theo dự án được phân công (Dự án Làng Vân N-test, project 196)",
        "usage": "Kiểm thử góc nhìn TKKD/TKDA bị giới hạn phạm vi dự án.",
    },
    {
        "username": "0900026794",
        "password": DEFAULT_TEST_PASSWORD,
        "role": "Trưởng phòng Thư ký Kinh doanh (TP-TKKD)",
        "scope": "Toàn bộ dự án",
        "usage": "Kiểm thử góc nhìn Trưởng phòng TKKD duyệt đối chiếu / bảng tính.",
    },
]

# =====================================================================
# 3. ÁNH XẠ ĐƯỜNG DẪN GIAO DIỆN (ROUTE) -> COMPONENT, API & SRS
# =====================================================================

ROUTE_KNOWLEDGE_MAP: List[Dict[str, Any]] = [
    {
        "route_pattern": "/accounting/commission-management/manager-monthly",
        "screen_name": "Bảng tổng kết Hoa hồng quản lý theo tháng (tên cũ: HH theo tháng — Quản lý)",
        "srs_doc": "features/accounting/20.14-monthly-beneficiary-commission-summary/fsd.md (§ 6.2b, § 6.2c, § 6.7)",
        "frontend_component": "web/src/features/accounting/commissions/components/CommMgrMonthlyTable.tsx",
        "backend_api": "/api/accounting/monthly-summaries/?role_group=manager",
        "related_tasks": ["MVL-3308 (86eyrhv87)", "MVL-3314 (86eyrevc6)", "ClickUp 86eyunfa5", "MVLGO-224", "MVLGO-245", "MVL-3618 (86eyt06ga)"],
        "key_columns_note": (
            "Tách riêng 2 cột đứng cạnh nhau: (1) 'Thưởng HH quản lý' (key: hh_quan_ly, tên cũ trước MVL-3308 là 'HH quản lý (TBC)') "
            "và (2) 'HHQL' (key: hh_kpi_hhql — hoa hồng quản lý tính theo % KPI phòng ban của 4 vai trò TPKD, GĐKD, TGĐ, TP.TKKD). "
            "Cột HHQL hiển thị số tiền khi khác 0 (kể cả số âm màu đỏ), chỉ bằng 0 mới hiển thị '—'. "
            "Theo ClickUp 86eyunfa5 & MVLGO-224, cột HHQL được GIỮ NGUYÊN KHÔNG ẨN trên màn Quản lý để bảo toàn Tổng các cột thành phần = Tổng HH."
        ),
    },
    {
        "route_pattern": "/accounting/commission-management/sale-monthly",
        "screen_name": "Bảng tổng kết Hoa hồng Sale theo tháng (HH theo tháng — Sale)",
        "srs_doc": "features/accounting/20.14-monthly-beneficiary-commission-summary/fsd.md (§ 6.2a, § 6.2c)",
        "frontend_component": "web/src/features/accounting/commissions/components/CommSaleMonthlyTable.tsx",
        "backend_api": "/api/accounting/monthly-summaries/?role_group=sale",
        "related_tasks": ["ClickUp 86eyunfa5", "MVL-3314 (86eyrevc6)"],
        "key_columns_note": "Đã ẩn cột 'HH Đầu tư, Xúc tiến & PT Dự án' theo task ClickUp 86eyunfa5.",
    },
    {
        "route_pattern": "/accounting/reports/hhql-monthly",
        "screen_name": "Báo cáo Bảng hoa hồng hàng tháng HHQL (Màn báo cáo chỉ-đọc)",
        "srs_doc": "features/accounting/20.19-monthly-management-commission-from-dept-kpi/fsd.md",
        "frontend_component": "web/src/features/accounting/reports/pages/HhqlMonthlyReportPage.tsx",
        "backend_api": "/api/accounting/management-commissions/",
        "related_tasks": ["MVL-3618 (86eyt06ga)", "MVL-3819 (86exztban)", "MVLGO-55", "MVLGO-211"],
        "key_columns_note": "Màn báo cáo chỉ-đọc tách riêng theo MVL-3618 để tra cứu chi tiết kết quả tính HHQL theo phòng ban/chi nhánh.",
    },
    {
        "route_pattern": "/org-chart/branch-management",
        "screen_name": "Quản lý Chi nhánh (Sơ đồ tổ chức)",
        "srs_doc": "features/hrm/2.1-branch-management/fsd.md",
        "frontend_component": "web/src/features/org-chart/branches/",
        "backend_api": "/api/hrm/branches/",
        "related_tasks": ["MVL-3819 (86exztban)"],
        "key_columns_note": "Chứa cấu hình 'Nguồn quản lý kinh doanh' (sales_manager_source & sales_director_source: Chuẩn / Phẳng / Lai) quyết định người nhận HHQL.",
    },
]

_TOKEN_CACHE: Dict[str, Tuple[float, str]] = {}


def get_cached_erp_jwt_token(api_base_url: str = "https://api.mvl.glinteco.com") -> Optional[str]:
    """
    Đăng nhập tự động vào ERP Backend API bằng tài khoản test admin để lấy JWT Bearer Token
    phục vụ Chrome DevTools MCP (inject vào localStorage.auth_token) hoặc gọi API trực tiếp.
    Cache token trong 25 phút.
    """
    base = api_base_url.rstrip("/")
    now = time.monotonic()
    cached = _TOKEN_CACHE.get(base)
    if cached and (now - cached[0]) < 1500.0:
        return cached[1]

    login_url = f"{base}/api/auth/login/"
    payload = json.dumps(
        {
            "username": os.environ.get("MVL_TEST_USERNAME", "admin"),
            "password": DEFAULT_TEST_PASSWORD,
            "device_id": "mvl-slack-agent-chrome-mcp",
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        login_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "curl/8.7.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            if 200 <= resp.status < 300:
                body = json.loads(resp.read().decode("utf-8", errors="ignore"))
                token = (
                    body.get("data", {}).get("tokens", {}).get("access")
                    or body.get("data", {}).get("access")
                    or body.get("access")
                )
                if token:
                    _TOKEN_CACHE[base] = (now, token)
                    return token
    except Exception as e:
        logger.debug(f"Could not mint JWT token from {login_url}: {e}")
    return None


def resolve_url_and_route_info(text: str) -> Dict[str, Any]:
    """
    Phân tích câu hỏi hoặc URL người dùng gửi (VD: erp.maivietland.vn/accounting/commission-management/manager-monthly?year=2026&page=4)
    và trả về thông tin môi trường + ánh xạ màn hình + hướng dẫn Chrome DevTools MCP.
    """
    raw_text = text or ""
    url_match = re.search(
        r"(?:https?://)?((?:erp|portal|mvl|api|host-app|cmsadmin|crm|appsale|pm)[a-z0-9\.\-]*\.(?:maivietland\.vn|glinteco\.com|up\.railway\.app))(/[a-zA-Z0-9_\-/]*)?(?:\?([^\s\)\>]*))?",
        raw_text,
        flags=re.IGNORECASE,
    )

    host = url_match.group(1).lower() if url_match else ""
    route_path = (url_match.group(2) or "/").rstrip("/") if url_match else ""
    if not route_path:
        route_path = "/"

    # Xác định tier từ domain
    detected_tier = "tier_1_dev_glinteco"
    if "maivietland.vn" in host:
        detected_tier = "tier_3_production"
    elif "staging.mvl.glinteco.com" in host:
        detected_tier = "tier_2_staging"
    elif "railway.app" in host:
        detected_tier = "tier_1_railway_dev"
    elif "pm.glinteco.com" in host:
        detected_tier = "plane_tracker"
    elif "glinteco.com" in host:
        detected_tier = "tier_1_dev_glinteco"

    # Khớp route_path với ROUTE_KNOWLEDGE_MAP
    matched_route_info = None
    for item in ROUTE_KNOWLEDGE_MAP:
        if item["route_pattern"] in route_path or item["route_pattern"] in raw_text:
            matched_route_info = item
            if route_path == "/":
                route_path = item["route_pattern"]
            break

    dev_glinteco_url = f"https://mvl.glinteco.com{route_path}"
    railway_erp_url = f"https://erp-web-production-bb1f.up.railway.app{route_path}"

    return {
        "detected_host": host or "mvl.glinteco.com",
        "detected_tier": detected_tier,
        "tier_info": MVL_ENVIRONMENTS.get(detected_tier, MVL_ENVIRONMENTS["tier_1_dev_glinteco"]),
        "clean_route": route_path,
        "matched_screen": matched_route_info,
        "chrome_mcp_targets": {
            "dev_glinteco_target": dev_glinteco_url,
            "railway_dev_target": railway_erp_url,
            "login_credentials": {
                "username": os.environ.get("MVL_TEST_USERNAME", "admin"),
                "password": DEFAULT_TEST_PASSWORD,
            },
            "chrome_mcp_steps": [
                f"1. Mở trang đăng nhập hoặc điều hướng tới: {dev_glinteco_url} (hoặc {railway_erp_url})",
                "2. Nếu chưa có session, đăng nhập bằng tài khoản superuser: username='admin', password=MVL_TEST_PASSWORD ('Demo123!@#') hoặc inject localStorage.setItem('auth_token', '<JWT_TOKEN>').",
                "3. Lưu ý bẫy Route Guard: nếu goto URL sâu lần đầu bị báo 403/unauthorized do quyền FE chưa kịp tải, reload lại đúng URL đó 1 lần sau khi có auth_token là vào thẳng màn hình.",
                "4. Dùng Chrome MCP take_snapshot / evaluate_script / list_network_requests để lấy cấu trúc cột và dữ liệu API thực tế từ https://api.mvl.glinteco.com.",
            ],
        },
    }


def format_environment_context_for_agent(query: str = "", include_token: bool = False) -> str:
    """
    Định dạng thông tin môi trường + tài khoản test + Chrome MCP playbook thành ngữ cảnh
    cho Antigravity Agent / Gemini Agent hoặc API endpoint.
    """
    info = resolve_url_and_route_info(query)
    lines = [
        "=== THÔNG TIN MÔI TRƯỜNG HỆ THỐNG MVL & HƯỚNG DẪN CHROME DEVTOOLS MCP ===",
        "• Tier 1 — Dev Glinteco (Test/Chụp ảnh chuẩn): Web `https://mvl.glinteco.com` | API `https://api.mvl.glinteco.com` | Admin `https://api.mvl.glinteco.com/admin/`",
        "• Tier 1 — Dev Railway Cloud: ERP Web `https://erp-web-production-bb1f.up.railway.app` | ERP API `https://erp-backend-production-484d.up.railway.app` | Host-App Shell `https://host-app-production.up.railway.app` | AppSale API `https://app-sale-backend-production.up.railway.app` | CMS Admin `https://cmsadmin-production-7b06.up.railway.app` | CRM `https://crm-production-0da1.up.railway.app` | Storefront `https://appsale-production.up.railway.app`",
        "• Tier 2 — Staging UAT (Client): Web `https://mvl.staging.mvl.glinteco.com` | API `https://api.staging.mvl.glinteco.com`",
        "• Tier 3 — Production (Chỉ đọc/đối chiếu): ERP `https://erp.maivietland.vn` | Portal `https://portal.maivietland.vn` | API `https://api.maivietland.vn` | Gateway `https://api-gateway.maivietland.vn`",
        "• Quản lý Task/Issue (Plane): `https://pm.glinteco.com` (Workspace: `glinteco`, Projects: `MVL`, `MVLGO`, `MAIVIETLAN`, `MVLCTV`)",
        f"• Tài khoản Test Chrome MCP / Playwright (Mật khẩu chung: `{DEFAULT_TEST_PASSWORD}`): `admin` (Superuser full quyền), `0300622217` (4 chi nhánh), `0900124966` (1 chi nhánh Quảng Ninh), `0700124595` (TKKD/TKDA), `0900026794` (TP-TKKD).",
    ]

    matched_screen = info.get("matched_screen")
    if matched_screen:
        lines.extend(
            [
                f"\n--- [Ánh xạ Màn hình từ URL người dùng: `{info['clean_route']}`] ---",
                f"• Tên màn hình chuẩn: {matched_screen['screen_name']}",
                f"• Tài liệu SRS: {matched_screen['srs_doc']}",
                f"• Component Giao diện: {matched_screen['frontend_component']}",
                f"• API Backend: {matched_screen['backend_api']}",
                f"• Các Task Plane/ClickUp liên quan: {', '.join(matched_screen['related_tasks'])}",
                f"• Logic hiển thị chi tiết: {matched_screen['key_columns_note']}",
                f"• URL kiểm thử tương đương cho Chrome MCP: `{info['chrome_mcp_targets']['dev_glinteco_target']}`",
            ]
        )

    if include_token:
        jwt_tok = get_cached_erp_jwt_token("https://api.mvl.glinteco.com") or get_cached_erp_jwt_token(
            "https://erp-backend-production-484d.up.railway.app"
        )
        if jwt_tok:
            lines.append(
                f"• Chrome MCP Quick Auth Script: `localStorage.setItem('auth_token', '{jwt_tok}'); location.reload();`"
            )

    lines.append("=== HẾT THÔNG TIN MÔI TRƯỜNG ===")
    return "\n".join(lines)
