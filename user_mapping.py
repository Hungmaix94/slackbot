"""
Mô-đun ánh xạ và tự động gán người phụ trách (Assignee Resolution) từ Slack sang Plane.
Hỗ trợ 5 cơ chế nhận diện theo thứ tự ưu tiên:
1. Tự gán cho người ra lệnh ("assign cho tôi", "giao cho tôi", "assign me") -> lấy sender_user_id từ Slack event.
2. Nhận diện trực tiếp Slack mention (<@U...>) trong tin nhắn ra lệnh (ví dụ: '@SRS Assist tạo task assign cho <@U093U4SP2Q6>').
3. Bóc tách cụm từ giao việc tiếng Việt tự nhiên ('assign Đức', 'assign Hung, a Khoa', 'assign cho Phuong Manh Duc', 'giao @ducpm').
4. Đối chiếu qua LLM task_extract ('explicit_assignee') + tra cứu Slack API (users.info) + đối chiếu động 71 thành viên Plane Workspace (Email, Prefix, Display Name, Họ tên không dấu).
5. Quét ngược lịch sử thread (3-5 tin nhắn gần nhất) nếu lệnh 'tạo task' / nút bấm '🐛 Tạo Task Plane' không chỉ định tên trực tiếp.
"""

import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("user_mapping")

# Bảng ánh xạ chuẩn xác 100% giữa Slack User ID (U0...), Slack handle, tên gọi thường dùng và Plane Member UUID
CORE_SLACK_TO_PLANE: Dict[str, str] = {
    # 1. HungPD — Phạm Đức Hùng (U077A1H657C)
    "u077a1h657c": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hungpd": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hung.pham": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hung.phamduc": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hung.phamduc@glinteco.com": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "phamhung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "phạm đức hùng": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "pham duc hung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "pham hung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "phạm hùng": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
    "hùng": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",

    # 2. DucPM — Phương Mạnh Đức (U093U4SP2Q6)
    "u093u4sp2q6": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "ducpm": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "duc.phuongmanh": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "duc.phuongmanh@glinteco.com": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "phương mạnh đức": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "phuong manh duc": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "mạnh đức": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "manh duc": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "đức": "dfd2b919-35b5-43f9-9f10-814d48990b31",
    "duc": "dfd2b919-35b5-43f9-9f10-814d48990b31",

    # 3. PhuongKT — Kiều Tuấn Phương / Arthur (U05AVLMLMFV)
    "u05avlmlmfv": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "phuongkt": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "phuong.kieutuan": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "phuong.kieutuan@glinteco.com": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "kiều tuấn phương": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "kieu tuan phuong": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "tuấn phương": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",
    "arthur": "8f934fcb-64be-4c73-80f0-23e9f316f6d6",

    # 4. HienTD — Trần Doãn Hiển (U0402U1R0LS)
    "u0402u1r0ls": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "hientd": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "hien.trandoan": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "hien.trandoan@glinteco.com": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "trần doãn hiển": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "tran doan hien": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "td hien": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "hiển": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
    "hien": "2323275e-6b9a-4147-8aa7-b0afe9c40121",

    # 5. HoaVQ — Vũ Quang Hòa (U040SJW2MUY)
    "u040sjw2muy": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "hoavq": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "hoa.vuquang": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "hoa.vuquang@glinteco.com": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "vũ quang hòa": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "vu quang hoa": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "hòa": "6292d351-72fb-4cc4-9f00-55fc818e981b",
    "hoà": "6292d351-72fb-4cc4-9f00-55fc818e981b",

    # 6. KhoaNC — Nguyễn Công Khoa (U0416UG8YQY)
    "u0416ug8yqy": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "khoanc": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "khoa.nguyencong": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "khoa.nguyencong@glinteco.com": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "nguyễn công khoa": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "nguyen cong khoa": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "khoa nguyễn": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "khoa nguyen": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
    "khoa": "d71fdb22-f20d-4465-a90c-90ee4cc26572",

    # 7. ManhNV — Nguyễn Việt Mạnh (U041RUV4AN8)
    "u041ruv4an8": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "manhnv": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "manh.nguyenviet": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "manh.nguyenviet@glinteco.com": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "nguyễn việt mạnh": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "nguyen viet manh": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
    "mạnh": "a8a221a1-ad81-4a34-92bc-34808a0502f0",

    # 8. NhungNT — Nguyễn Thị Nhung (U09U59A9FA4)
    "u09u59a9fa4": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhungnt": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung.nguyenthi": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung.nguyenthi@glinteco.com": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung nguyễn": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung nguyen": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nguyễn nhung": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
    "nhung": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",

    # 9. MyLT — Lê Thế Mỹ (U0BDNFV9MB9)
    "u0bdnfv9mb9": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "mylt": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "mylth-glinteco": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "my.lethe": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "my.lethe@glinteco.com": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "lê thế mỹ": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "le the my": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
    "mỹ lê thế": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",

    # 10. DucVA — Vũ Anh Đức (U09T2V3KPEJ)
    "u09t2v3kpej": "2fb19f2a-9743-481b-a3f9-48fee9ada01d",
    "ducva": "2fb19f2a-9743-481b-a3f9-48fee9ada01d",
    "duc.vuanh": "2fb19f2a-9743-481b-a3f9-48fee9ada01d",
    "duc.vuanh@glinteco.com": "2fb19f2a-9743-481b-a3f9-48fee9ada01d",
    "vũ anh đức": "2fb19f2a-9743-481b-a3f9-48fee9ada01d",
    "vu anh duc": "2fb19f2a-9743-481b-a3f9-48fee9ada01d",

    # 11. Ley — Quản Trần Hồng Lê (U08TS8LJZ2A)
    "u08ts8ljz2a": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
    "ley": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
    "quantranhongle": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
    "ley quan": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",

    # 12. VuNguyen — Nguyễn Vũ (U09RAUY9Q1L)
    "u09rauy9q1l": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vung": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vunguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vu nguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vu.nguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
    "vu.nguyen@glinteco.com": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",

    # 13. LamNT — Nguyễn Tùng Lâm (U0B85TLPT0Q)
    "u0b85tlpt0q": "a74ba1a6-3ff0-48b7-8148-a342259472d9",
    "lamnt": "a74ba1a6-3ff0-48b7-8148-a342259472d9",
    "lam.nguyentung": "a74ba1a6-3ff0-48b7-8148-a342259472d9",
    "lam.nguyentung@glinteco.com": "a74ba1a6-3ff0-48b7-8148-a342259472d9",
    "nguyễn tùng lâm": "a74ba1a6-3ff0-48b7-8148-a342259472d9",
    "nguyen tung lam": "a74ba1a6-3ff0-48b7-8148-a342259472d9",
    "tùng lâm": "a74ba1a6-3ff0-48b7-8148-a342259472d9",

    # 14. DuongVD — Vũ Đại Dương (U0C6E26DQ4B)
    "u0c6e26dq4b": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "duongvd": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "duong.vudai": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "duong.vudai@glinteco.com": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "vũ đại dương": "660f015e-e1e8-4ce3-9905-c7ced49325b9",
    "duong vu dai": "660f015e-e1e8-4ce3-9905-c7ced49325b9",

    # 15. AnhPD — Phùng Đức Anh (U0AQ96NU1TM)
    "u0aq96nu1tm": "33433931-982b-476c-9421-46423740e545",
    "anhpd": "33433931-982b-476c-9421-46423740e545",
    "ducanh.phung": "33433931-982b-476c-9421-46423740e545",
    "ducanh.phung@glinteco.com": "33433931-982b-476c-9421-46423740e545",
    "phùng đức anh": "33433931-982b-476c-9421-46423740e545",
    "phung duc anh": "33433931-982b-476c-9421-46423740e545",
    "đức anh": "33433931-982b-476c-9421-46423740e545",
    "duc anh": "33433931-982b-476c-9421-46423740e545",

    # 16. Troy / ViNT — Nguyễn Tường Vi (U08T23C7R5Z)
    "u08t23c7r5z": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "vint": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "troy": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "vi.nguyentuong": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "vi.nguyentuong@glinteco.com": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "nguyễn tường vi": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
    "tường vi": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",

    # 17. MaiNV — Nguyễn Vũ Mai (U0AHM8A1VL3)
    "u0ahm8a1vl3": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
    "mainv": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
    "mai.nguyenvu": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
    "mai.nguyenvu@glinteco.com": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",

    # 18. PhongDNH — Đỗ Nguyễn Hùng Phong (U09BZEA1RQD)
    "u09bzea1rqd": "52da5ccd-3f5c-48f6-9abf-fdb75496affd",
    "phongdnh": "52da5ccd-3f5c-48f6-9abf-fdb75496affd",
    "phong.donguyen": "52da5ccd-3f5c-48f6-9abf-fdb75496affd",
    "phong.donguyen@glinteco.com": "52da5ccd-3f5c-48f6-9abf-fdb75496affd",
    "đỗ nguyễn hùng phong": "52da5ccd-3f5c-48f6-9abf-fdb75496affd",

    # 19. QuangNM — Nguyễn Minh Quang (U0ATXUXCKRB)
    "u0atxuxckrb": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",
    "quangnm": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",
    "quang.nguyenminh": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",
    "quang.nguyenminh@glinteco.com": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",
    "minh quang": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",

    # 20. AnhTM — Trần Minh Anh (U0BE5CC1AJ0)
    "u0be5cc1aj0": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
    "anhtm": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
    "anh.tranminh": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
    "anh.tranminh@glinteco.com": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
    "minh anh trần": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
    "minh anh tran": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",

    # 21. PhuongVH — Vũ Thị Hà Phương (U0C54JWU1FZ)
    "u0c54jwu1fz": "13b2755b-51f1-4ae9-8526-e46dc447b0f7",
    "phuongvh": "13b2755b-51f1-4ae9-8526-e46dc447b0f7",
    "phuong.vuha": "13b2755b-51f1-4ae9-8526-e46dc447b0f7",
    "phuong.vuha@glinteco.com": "13b2755b-51f1-4ae9-8526-e46dc447b0f7",
    "vũ hà phương": "13b2755b-51f1-4ae9-8526-e46dc447b0f7",
    "vũ thị hà phương": "13b2755b-51f1-4ae9-8526-e46dc447b0f7",

    # 22. HieuNT — Nguyễn Trung Hiếu (U0ALTU0AD5H)
    "u0altu0ad5h": "f9e3cfbd-37b5-4dc2-8c79-bce983ffc6ab",
    "hieunt": "f9e3cfbd-37b5-4dc2-8c79-bce983ffc6ab",
    "hieu.nguyentrung": "f9e3cfbd-37b5-4dc2-8c79-bce983ffc6ab",
    "hieu.nguyen": "f9e3cfbd-37b5-4dc2-8c79-bce983ffc6ab",

    # 23. KienHT, AnhDM, DatNT, VyNT, TrangNN, TrangPT, ToanTD, HangNT, Developers
    "u0annnts7ml": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
    "kienht": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
    "u0appgpv0h5": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
    "anhdm": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
    "u0bg6qws7c0": "06fc141d-fe49-4073-bf02-542c873cd285",
    "datnt": "06fc141d-fe49-4073-bf02-542c873cd285",
    "datnt114": "06fc141d-fe49-4073-bf02-542c873cd285",
    "u0bjakl7v18": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
    "vy.nguyenthao": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
    "u08098834sh": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
    "trang.nguyenngoc": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
    "trang nguyen": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
    "trangpt": "742e08d1-5997-4069-8bbc-42f32d0b014e",
    "trang.phamthu": "742e08d1-5997-4069-8bbc-42f32d0b014e",
    "toantd": "dd54a437-8b30-41d6-9870-28591d557d24",
    "u0a2ym2avrn": "74abc795-c77f-450f-894f-2817beb27d76",
    "hangnt": "74abc795-c77f-450f-894f-2817beb27d76",
    "u07fq89ud0w": "84f4b285-6aec-436c-a32d-022b3ef0c216",
    "developers": "84f4b285-6aec-436c-a32d-022b3ef0c216",
}

HONORIFIC_PREFIX_RE = re.compile(
    r"^(?:anh|chị|chi|em|bạn|ban|cô|co|chú|chu|a|c|e)\s+",
    flags=re.IGNORECASE,
)

SELF_ASSIGN_PATTERNS = re.compile(
    r"\b(?:assign|giao)\s+(?:task\s+|bug\s+)?(?:cho\s+)?(?:tôi|mình|em|t|me)\b",
    flags=re.IGNORECASE,
)


def _normalize(text: Optional[str]) -> str:
    if not text:
        return ""
    cleaned = text.strip().lower().lstrip("@")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = HONORIFIC_PREFIX_RE.sub("", cleaned).strip()
    return cleaned


def _strip_accents(text: str) -> str:
    if not text:
        return ""
    text = text.replace("đ", "d").replace("Đ", "D")
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )


def extract_inline_assignee_names(text: str) -> List[str]:
    """
    Bóc tách danh sách tên / username người được giao trực tiếp từ câu lệnh tiếng Việt tự nhiên.
    Ví dụ:
    - 'tạo bug ... giao @ducpm' -> ['ducpm']
    - 'tạo cr assign Đức : màn Chủ đầu tư' -> ['Đức']
    - 'assign Hung, a Khoa' -> ['Hung', 'a Khoa']
    - 'tạo cr cho yêu cầu ... assign cho Phuong Manh Duc' -> ['Phuong Manh Duc']
    """
    if not text:
        return []
    results: List[str] = []
    # 1. Bắt dạng @username (không phải Slack tag <@U...>)
    for m in re.finditer(r"(?<!<)@([a-zA-Z0-9._\-]{3,30})", text):
        uname = m.group(1).strip()
        if uname.lower() not in ("srs", "bot", "channel", "here", "everyone"):
            results.append(uname)

    # 2. Bắt dạng 'assign [cho] <Tên 1>, <Tên 2>' hoặc 'giao [cho] <Tên>'
    for m in re.finditer(
        r"\b(?:assign|giao)(?:\s+task|\s+bug)?(?:\s+cho|\s+đến|\s+tới)?\s+([^\n:;\.]+)",
        text,
        flags=re.IGNORECASE,
    ):
        tail = m.group(1).strip()
        # Bỏ qua nếu là Slack mention <@U...> hoặc tự gán ('tôi', 'mình')
        if tail.startswith("<@") or re.match(r"^(?:tôi|mình|em|t|me)\b", tail, flags=re.IGNORECASE):
            continue
        # Cắt tại các từ nối kết thúc cụm tên
        tail = re.split(
            r"\s+(?:nhé|nhe|nha|giúp|giup|hộ|ho|với|voi|trong|ở|o|tại|tai|màn|man|phân\s+hệ)\b",
            tail,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0].strip()
        parts = re.split(r"\s*(?:,|và|&|\+)\s*", tail)
        for p in parts:
            p_clean = p.strip().strip("-").strip()
            if 2 <= len(p_clean) <= 35 and not p_clean.startswith("<@"):
                results.append(p_clean)

    return results


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
    1. Bảng tra cứu chuẩn CORE_SLACK_TO_PLANE (có dấu & không dấu, bỏ tiền tố 'anh/chị/em/a/c')
    2. Khớp chính xác Email hoặc tiền tố Email (email.split('@')[0])
    3. Khớp display_name trên Plane
    4. Khớp Họ và Tên (first_name + last_name, cả có dấu và không dấu)
    """
    raw_keys = [
        _normalize(slack_user_id),
        _normalize(slack_username),
        _normalize(slack_display_name),
        _normalize(slack_real_name),
        _normalize(slack_email),
        _normalize(raw_query),
    ]
    keys_to_check: List[str] = []
    for k in raw_keys:
        if k:
            keys_to_check.append(k)
            no_acc = _strip_accents(k)
            if no_acc and no_acc != k:
                keys_to_check.append(no_acc)

    for k in keys_to_check:
        if k in CORE_SLACK_TO_PLANE:
            target_id = CORE_SLACK_TO_PLANE[k]
            for m in plane_members:
                if m.get("id") == target_id:
                    return m
            return {"id": target_id, "display_name": k}

    for m in plane_members:
        m_email = _normalize(m.get("email"))
        m_prefix = m_email.split("@")[0] if "@" in m_email else m_email
        m_disp = _normalize(m.get("display_name"))
        m_disp_no_acc = _strip_accents(m_disp)
        first = m.get("first_name") or ""
        last = m.get("last_name") or ""
        m_full = _normalize(f"{first} {last}")
        m_full_rev = _normalize(f"{last} {first}")
        m_full_no_acc = _strip_accents(m_full)
        m_full_rev_no_acc = _strip_accents(m_full_rev)

        for c in keys_to_check:
            if not c:
                continue
            if c in (m_email, m_prefix, m_disp, m_disp_no_acc):
                return m
            if len(c) >= 4 and c in (m_full, m_full_rev, m_full_no_acc, m_full_rev_no_acc):
                return m
            if len(c) >= 5 and (c in m_full or c in m_full_no_acc):
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

    if client:
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
    sender_user_id: Optional[str] = None,
) -> List[Tuple[str, str]]:
    """
    Trích xuất và ánh xạ toàn bộ người phụ trách được yêu cầu theo 5 tầng ưu tiên.
    Trả về danh sách các tuple: [(plane_member_uuid, display_label)]
    """
    plane_members = []
    if plane_client:
        try:
            plane_members = await plane_client.get_workspace_members()
        except Exception as e:
            logger.error(f"Lỗi khi lấy danh sách workspace members từ Plane: {e}")

    resolved: List[Tuple[str, str]] = []
    seen_plane_ids = set()

    # 1. Tự gán cho bản thân người ra lệnh ('assign cho tôi', 'giao cho tôi', 'assign me')
    effective_sender = sender_user_id
    if not effective_sender and messages:
        effective_sender = messages[-1].get("user")
    if effective_sender and SELF_ASSIGN_PATTERNS.search(trigger_text or ""):
        plane_id, label = await resolve_slack_user(client, effective_sender, plane_members)
        if plane_id and plane_id not in seen_plane_ids:
            resolved.append((plane_id, label))
            seen_plane_ids.add(plane_id)

    # 2. Trích xuất tất cả Slack mention (<@U...>) trong tin nhắn ra lệnh
    trigger_mentions = re.findall(r"<@([A-Z0-9]+)>", trigger_text or "")
    target_mentions = [uid for uid in trigger_mentions if uid != bot_user_id]

    for uid in target_mentions:
        plane_id, label = await resolve_slack_user(client, uid, plane_members)
        if plane_id and plane_id not in seen_plane_ids:
            resolved.append((plane_id, label))
            seen_plane_ids.add(plane_id)

    # 3. Bóc tách tên/username viết trực tiếp trong câu lệnh ('assign Đức', 'assign Hung, a Khoa', 'giao @ducpm')
    if not resolved:
        inline_names = extract_inline_assignee_names(trigger_text or "")
        for name_token in inline_names:
            matched = match_plane_member(plane_members, raw_query=name_token)
            if matched and matched.get("id") not in seen_plane_ids:
                m_id = matched.get("id")
                m_label = matched.get("display_name") or name_token
                resolved.append((m_id, m_label))
                seen_plane_ids.add(m_id)

    # 4. Nếu tin nhắn ra lệnh chưa khớp, kiểm tra explicit_assignee_text do LLM trích xuất
    if not resolved and explicit_assignee_text:
        text_mentions = re.findall(r"<@([A-Z0-9]+)>", explicit_assignee_text)
        for uid in text_mentions:
            if uid != bot_user_id:
                plane_id, label = await resolve_slack_user(client, uid, plane_members)
                if plane_id and plane_id not in seen_plane_ids:
                    resolved.append((plane_id, label))
                    seen_plane_ids.add(plane_id)

        if not resolved:
            for part in re.split(r"\s*(?:,|và|&)\s*", explicit_assignee_text):
                part = part.strip()
                if not part:
                    continue
                matched = match_plane_member(plane_members, raw_query=part)
                if matched and matched.get("id") not in seen_plane_ids:
                    m_id = matched.get("id")
                    m_label = matched.get("display_name") or part
                    resolved.append((m_id, m_label))
                    seen_plane_ids.add(m_id)

    # 5. Nếu vẫn chưa có (người dùng chỉ gõ 'tạo task' / bấm nút trong thread), quét ngược 4 tin nhắn gần nhất trong thread
    if not resolved and messages:
        for msg in reversed(messages[-4:]):
            m_text = msg.get("text", "")
            for uid in re.findall(r"<@([A-Z0-9]+)>", m_text):
                if uid != bot_user_id:
                    plane_id, label = await resolve_slack_user(client, uid, plane_members)
                    if plane_id and plane_id not in seen_plane_ids:
                        resolved.append((plane_id, label))
                        seen_plane_ids.add(plane_id)
                        break
            if not resolved:
                for name_token in extract_inline_assignee_names(m_text):
                    matched = match_plane_member(plane_members, raw_query=name_token)
                    if matched and matched.get("id") not in seen_plane_ids:
                        m_id = matched.get("id")
                        m_label = matched.get("display_name") or name_token
                        resolved.append((m_id, m_label))
                        seen_plane_ids.add(m_id)
                        break
            if resolved:
                break

    return resolved
