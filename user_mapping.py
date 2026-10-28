"""
Mô-đun ánh xạ và tự động gán người phụ trách (Assignee Resolution) từ Slack sang Plane.
Hỗ trợ:
1. Nhận diện trực tiếp Slack mention (<@U...>) trong tin nhắn ra lệnh (ví dụ: '@SRS Assist tạo task cho @phuongkt').
2. Tra cứu thông tin người dùng từ Slack API (users.info): username, display_name, real_name, email.
3. Đối chiếu tự động với danh sách thành viên Plane Workspace qua Email, Username/Prefix và Display Name.
4. Bảng tra cứu tĩnh kế thừa từ hệ thống Plane Workspace (220+ thành viên).
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("user_mapping")

# Bảng tra cứu thủ công ưu tiên cao cho các thành viên thường xuyên nhận task
CORE_SLACK_TO_PLANE: Dict[str, str] = {
    # PhuongKT (Kiều Tuấn Phương / Arthur)
    "u05avlmlmfv": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "phuongkt": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "phuong.kieutuan": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "phuong.kieutuan@glinteco.com": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "kiều tuấn phương": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "kieu tuan phuong": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "arthur": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",

    # DucPM (Phương Mạnh Đức)
    "ducpm": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "duc.phuongmanh": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "duc.phuongmanh@glinteco.com": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "phương mạnh đức": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "phuong manh duc": "dfd2b919-35b5-43f9-9f10-814d48990b31",

    # HungPD (Phạm Đức Hùng)
    "hung.phamduc": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hung.phamduc@glinteco.com": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "phamhung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "phạm đức hùng": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",

    # MaiNV
    "mainv": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
    "mai.nguyenvu": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
    "mai.nguyenvu@glinteco.com": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",

    # Troy (Nguyễn Tường Vi)
    "troy": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "vi.nguyentuong": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "vi.nguyentuong@glinteco.com": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",

    # NhungNT (Nguyễn Nhung)
    "nhungnt": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung.nguyenthi": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung.nguyenthi@glinteco.com": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",

    # VuNguyen
    "vunguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vu nguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vu.nguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vu.nguyen@glinteco.com": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",

    # DuongVD (Vũ Đại Dương)
    "duongvd": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "duong.vudai": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "duong.vudai@glinteco.com": "660f015e-e1e8-4ce3-9905-c7ced49325b9",

    # KhoaNC, HienTD, HoaVQ, ManhNV, TrangPT, ToanTD
    "khoanc": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "hientd": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "hoavq": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "manhnv": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "trangpt": "742e08d1-5997-4069-8bbc-42f32d0b014e",
    "toantd": "dd54a437-8b30-41d6-9870-28591d557d24",
}


def _normalize(text: Optional[str]) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


def match_plane_member(
    plane_members: List[Dict[str, Any]],
    slack_user_id: Optional[str] = None,
    slack_username: Optional[str] = None,
    slack_display_name: Optional[str] = None,
    slack_real_name: Optional[str] = None,
    slack_email: Optional[str] = None,
    raw_query: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Tìm thành viên Plane Workspace khớp nhất với thông tin từ Slack.
    Thứ tự ưu tiên:
    1. Bảng tra cứu tĩnh CORE_SLACK_TO_PLANE
    2. Khớp chính xác Email
    3. Khớp tiền tố Email (email.split('@')[0]) với username hoặc display_name
    4. Khớp display_name trên Plane
    5. Khớp Họ và Tên (first_name + last_name)
    """
    keys_to_check = [
        _normalize(slack_user_id),
        _normalize(slack_username),
        _normalize(slack_display_name),
        _normalize(slack_email),
        _normalize(raw_query),
    ]

    for k in keys_to_check:
        if k and k in CORE_SLACK_TO_PLANE:
            target_id = CORE_SLACK_TO_PLANE[k]
            for m in plane_members:
                if m.get("id") == target_id:
                    return m
            # Trả về dummy dict chứa id nếu Plane API chưa list kịp
            return {"id": target_id, "display_name": k}

    candidates = [k for k in keys_to_check if k]
    if slack_real_name:
        candidates.append(_normalize(slack_real_name))

    for m in plane_members:
        m_email = _normalize(m.get("email"))
        m_prefix = m_email.split("@")[0] if "@" in m_email else m_email
        m_disp = _normalize(m.get("display_name"))
        first = m.get("first_name") or ""
        last = m.get("last_name") or ""
        m_full = _normalize(f"{first} {last}")

        for c in candidates:
            if not c:
                continue
            if c == m_email or c == m_prefix or c == m_disp:
                return m
            if len(c) >= 4 and (c == m_full or c in m_full or m_full in c):
                return m

    return None


async def resolve_slack_user(
    client,
    slack_user_id: str,
    plane_members: List[Dict[str, Any]],
) -> Tuple[Optional[str], str]:
    """
    Tra cứu thông tin Slack user và tìm Plane member ID tương ứng.
    Trả về: (plane_member_uuid, user_display_label)
    """
    label = f"<@{slack_user_id}>"
    username = None
    display_name = None
    real_name = None
    email = None

    try:
        res = await client.users_info(user=slack_user_id)
        if res.get("ok"):
            u = res.get("user", {})
            username = u.get("name")
            real_name = u.get("real_name")
            profile = u.get("profile", {})
            display_name = profile.get("display_name") or profile.get("real_name")
            email = profile.get("email")
            best_name = display_name or username or real_name
            if best_name:
                label = f"<@{slack_user_id}> ({best_name})"
    except Exception as e:
        logger.warning(f"Không thể lấy users_info cho {slack_user_id}: {e}")

    matched = match_plane_member(
        plane_members=plane_members,
        slack_user_id=slack_user_id,
        slack_username=username,
        slack_display_name=display_name,
        slack_real_name=real_name,
        slack_email=email,
    )
    if matched:
        return matched.get("id"), label

    return None, label


async def extract_and_resolve_assignees(
    client,
    trigger_text: str,
    messages: List[Dict[str, Any]],
    bot_user_id: Optional[str],
    plane_client,
    explicit_assignee_text: Optional[str] = None,
) -> List[Tuple[str, str]]:
    """
    Trích xuất và ánh xạ toàn bộ người phụ trách được yêu cầu.
    Trả về danh sách các tuple: [(plane_member_uuid, display_label)]
    """
    plane_members = []
    try:
        plane_members = await plane_client.get_workspace_members()
    except Exception as e:
        logger.error(f"Lỗi khi lấy danh sách workspace members từ Plane: {e}")

    resolved: List[Tuple[str, str]] = []
    seen_plane_ids = set()

    # 1. Trích xuất tất cả Slack mention (<@U...>) trong tin nhắn ra lệnh
    trigger_mentions = re.findall(r"<@([A-Z0-9]+)>", trigger_text or "")
    target_mentions = [uid for uid in trigger_mentions if uid != bot_user_id]

    for uid in target_mentions:
        plane_id, label = await resolve_slack_user(client, uid, plane_members)
        if plane_id and plane_id not in seen_plane_ids:
            resolved.append((plane_id, label))
            seen_plane_ids.add(plane_id)

    # 2. Nếu tin nhắn ra lệnh không có mention, kiểm tra explicit_assignee_text từ LLM
    if not resolved and explicit_assignee_text:
        text_mentions = re.findall(r"<@([A-Z0-9]+)>", explicit_assignee_text)
        for uid in text_mentions:
            if uid != bot_user_id:
                plane_id, label = await resolve_slack_user(client, uid, plane_members)
                if plane_id and plane_id not in seen_plane_ids:
                    resolved.append((plane_id, label))
                    seen_plane_ids.add(plane_id)

        if not resolved:
            matched = match_plane_member(plane_members, raw_query=explicit_assignee_text)
            if matched and matched.get("id") not in seen_plane_ids:
                m_id = matched.get("id")
                m_label = matched.get("display_name") or explicit_assignee_text
                resolved.append((m_id, m_label))
                seen_plane_ids.add(m_id)

    # 3. Nếu vẫn chưa có và người dùng chỉ nói chung chung 'tạo task', kiểm tra tin nhắn gần nhất trong thread
    if not resolved and messages:
        for msg in reversed(messages[-3:]):
            m_text = msg.get("text", "")
            for uid in re.findall(r"<@([A-Z0-9]+)>", m_text):
                if uid != bot_user_id:
                    plane_id, label = await resolve_slack_user(client, uid, plane_members)
                    if plane_id and plane_id not in seen_plane_ids:
                        resolved.append((plane_id, label))
                        seen_plane_ids.add(plane_id)
                        break
            if resolved:
                break

    return resolved
