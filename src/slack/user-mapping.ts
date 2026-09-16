import { Env } from "../config/env";
import { SlackClient } from "./client";
import { PlaneClient } from "../plane/client";

export const INITIAL_SLACK_TO_CLICKUP_USERS: Record<string, number> = {
  "nhung nguyễn": 107451239,
  "nhung nguyen": 107451239,
  "duc hung pham": 288804163,
  "phamhung": 288804163,
  "vy nguyễn thảo": 113605915,
  "vy nguyen thao": 113605915,
  "minh anh tran design": 101462889,
  "giang nguyen": 216194714,
  "giang nguyễn": 216194714,
  "minh quang": 113471173,
  "vu anh duc": 107450663,
  "vũ anh đức": 107450663,
  "minh anh": 113429058,
  "kien tuanho": 113418766,
  "hieu nguyen": 113410484,
  "hiếu nguyễn": 113410484,
  "nguyễn bảo liên": 113403029,
  "nguyen bao lien": 113403029,
  "ánh mai": 107690851,
  "anh mai": 107690851,
  "phong đỗ nguyễn hùng": 294612005,
  "phong do nguyen hung": 294612005,
  "hangnt": 107543173,
  "vunguyen": 107410184,
  "vu nguyen": 107410184,
  "hoàng vũ": 101516237,
  "hoang vu": 101516237,
  "lê khanh": 101515555,
  "le khanh": 101515555,
  "toantd": 294767809,
  "lê sơn duy": 101446032,
  "le son duy": 101446032,
  "nguyễn ngọc tráng": 101444960,
  "nguyen ngoc trang": 101444960,
  "tường vi": 101444942,
  "tuong vi": 101444942,
  "phuong manh duc": 101444935,
  "trang pham": 101444933,
  "trang phạm": 101444933,
  "kiều tuấn phương": 101444932,
  "kieu tuan phuong": 101444932,
  "nguyễn việt mạnh": 101407928,
  "nguyen viet manh": 101407928,
  "lê quán trần hồng": 95492241,
  "le quan tran hong": 95492241,
  "vu quang hoa": 55720511,
  "vũ quang hòa": 55720511,
  "td hien": 288725041,
  "khoa nguyễn": 282755116,
  "khoa nguyen": 282755116,
};

export const INITIAL_SLACK_TO_PLANE_USERS: Record<string, string> = {
  "nhung.nguyenthi@glinteco.com": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
  "nhung.nguyenthi": "4a02d7de-cc11-4d8f-807a-8c202f98aaee",
  "nguyễn nhung": "693e967b-a801-45bb-8713-061fb2da857b",
  "vu.nguyen@glinteco.com": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
  "vu.nguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
  "vu nguyen": "6968627a-e5fe-4bcf-8cf8-cb5facdabd9a",
  "quang.nguyenminh@glinteco.com": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",
  "quang.nguyenminh": "615f96cb-fa50-4dc9-afed-425a0d80cb4b",
  "minh quang": "2b2cfb95-fb99-426d-9d2f-cd17dba5a883",
  "mai.nguyenvu@glinteco.com": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
  "mai.nguyenvu": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
  "mainv": "72dc3c0b-ec84-47fe-9eb3-a51660b02a41",
  "anh.tranminh@glinteco.com": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
  "anh.tranminh": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
  "minh anh trần": "334aef0c-33da-4a5b-a0bc-7e66caf62be5",
  "hung.phamduc@glinteco.com": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "hung.phamduc": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "pham hung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "duc.phuongmanh@glinteco.com": "dfd2b919-35b5-43f9-9f10-814d48990b31",
  "duc.phuongmanh": "dfd2b919-35b5-43f9-9f10-814d48990b31",
  "ducpm": "dfd2b919-35b5-43f9-9f10-814d48990b31",
  "vi.nguyentuong@glinteco.com": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
  "vi.nguyentuong": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
  "troy": "bd144161-9cf9-46b6-9b7e-d0beb6e240a1",
  "my.lethe@glinteco.com": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
  "my.lethe": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
  "mylth-glinteco": "7364f4b5-7d16-4c4e-ad66-c042ceb46735",
  "trang.nguyenngoc@glinteco.com": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
  "trang.nguyenngoc": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
  "trang nguyen": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
  "nguyen trang": "e20ae704-c4d6-4ed8-b718-269c06fed08f",
  "duy.leson@glinteco.com": "d7e35a07-69df-423b-9136-558aba587900",
  "duy.leson": "d7e35a07-69df-423b-9136-558aba587900",
  "lê sơn duy": "f0826f0d-1d4b-48d1-a270-4ee9d3539acb",
  "duy lê sơn": "f0826f0d-1d4b-48d1-a270-4ee9d3539acb",
  "duyleson76@gmail.com": "f0826f0d-1d4b-48d1-a270-4ee9d3539acb",
  "duyleson76": "f0826f0d-1d4b-48d1-a270-4ee9d3539acb",
  "tung.nguyenthanh010102@gmail.com": "31bc7398-e5e3-4f59-b767-c1b8508eb298",
  "tung.nguyenthanh010102": "31bc7398-e5e3-4f59-b767-c1b8508eb298",
  "nguyễn thanh tùng": "31bc7398-e5e3-4f59-b767-c1b8508eb298",
  "tùng nguyễn thanh": "31bc7398-e5e3-4f59-b767-c1b8508eb298",
  "bungnud113@gmail.com": "e5bcd53f-76c3-4db6-a432-95df840f94a2",
  "bungnud113": "e5bcd53f-76c3-4db6-a432-95df840f94a2",
  "hoàng việt dũng": "9b108cf9-a045-4c1d-87f7-b86ee773f08a",
  "dũng hoàng việt": "e5bcd53f-76c3-4db6-a432-95df840f94a2",
  "luongng130702@gmail.com": "6043755c-554c-48ee-a7e2-de84240dc80e",
  "luongng130702": "6043755c-554c-48ee-a7e2-de84240dc80e",
  "luong nguyen": "6043755c-554c-48ee-a7e2-de84240dc80e",
  "nguyen luong": "6043755c-554c-48ee-a7e2-de84240dc80e",
  "quynhwhuong@gmail.com": "6bde313e-47f7-4d1b-8197-37a5b5a041a3",
  "quynhwhuong": "6bde313e-47f7-4d1b-8197-37a5b5a041a3",
  "nguyễn quỳnh hương": "6bde313e-47f7-4d1b-8197-37a5b5a041a3",
  "hương nguyễn quỳnh": "6bde313e-47f7-4d1b-8197-37a5b5a041a3",
  "tommy.qdo27@gmail.com": "cb257adb-1b31-4056-8831-0e9e461f8167",
  "tommy.qdo27": "cb257adb-1b31-4056-8831-0e9e461f8167",
  "tommy do": "cb257adb-1b31-4056-8831-0e9e461f8167",
  "do tommy": "cb257adb-1b31-4056-8831-0e9e461f8167",
  "pthuyenanh.work@gmail.com": "889b8fca-99b2-45ed-a348-9ba78e279715",
  "pthuyenanh.work": "889b8fca-99b2-45ed-a348-9ba78e279715",
  "pham thi huyen anh": "889b8fca-99b2-45ed-a348-9ba78e279715",
  "anh pham thi huyen": "889b8fca-99b2-45ed-a348-9ba78e279715",
  "nhoangvu1123@gmail.com": "f015a9c2-5e12-4ef6-8b44-b5c26789b8eb",
  "nhoangvu1123": "f015a9c2-5e12-4ef6-8b44-b5c26789b8eb",
  "hoàng vũ": "f015a9c2-5e12-4ef6-8b44-b5c26789b8eb",
  "vũ hoàng": "f015a9c2-5e12-4ef6-8b44-b5c26789b8eb",
  "lhung3452@gmail.com": "f9ef6152-74aa-43e3-999f-54792ccb2f7c",
  "lhung3452": "f9ef6152-74aa-43e3-999f-54792ccb2f7c",
  "hưng lê": "2eca8cac-e84a-4ecf-b978-78509650f3b0",
  "lê hưng": "2eca8cac-e84a-4ecf-b978-78509650f3b0",
  "matocnhoi@gmail.com": "6d49733b-ee2f-4cae-baaa-4a314ce63652",
  "matocnhoi": "6d49733b-ee2f-4cae-baaa-4a314ce63652",
  "kk": "6d49733b-ee2f-4cae-baaa-4a314ce63652",
  "hung.leviet@glinteco.com": "2eca8cac-e84a-4ecf-b978-78509650f3b0",
  "hung.leviet": "2eca8cac-e84a-4ecf-b978-78509650f3b0",
  "dung.hoangviet@glinteco.com": "9b108cf9-a045-4c1d-87f7-b86ee773f08a",
  "dung.hoangviet": "9b108cf9-a045-4c1d-87f7-b86ee773f08a",
  "việt dũng hoàng": "9b108cf9-a045-4c1d-87f7-b86ee773f08a",
  "vulq@glinteco.com": "23709246-cf6e-4e19-8479-4dcfdf83e874",
  "vulq": "23709246-cf6e-4e19-8479-4dcfdf83e874",
  "vu.lequoc@glinteco.com": "2f29954b-25d7-41e6-af0c-46927570dcf6",
  "vu.lequoc": "2f29954b-25d7-41e6-af0c-46927570dcf6",
  "le vu": "2f29954b-25d7-41e6-af0c-46927570dcf6",
  "vu le": "2f29954b-25d7-41e6-af0c-46927570dcf6",
  "leqvu5203@gmail.com": "0c833115-b26c-4566-ae5b-7db2ea128c36",
  "leqvu5203": "0c833115-b26c-4566-ae5b-7db2ea128c36",
  "quốc vũ": "0c833115-b26c-4566-ae5b-7db2ea128c36",
  "vũ quốc": "0c833115-b26c-4566-ae5b-7db2ea128c36",
  "tranhoangthienan0711@gmail.com": "dbb24fd6-887c-41e5-a769-0863854a38d5",
  "tranhoangthienan0711": "dbb24fd6-887c-41e5-a769-0863854a38d5",
  "thiên an trần": "dbb24fd6-887c-41e5-a769-0863854a38d5",
  "trần thiên an": "dbb24fd6-887c-41e5-a769-0863854a38d5",
  "khoa.nguyencong@glinteco.com": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "khoa.nguyencong": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "khoa nguyễn": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "nguyễn khoa": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "hien.trandoan@glinteco.com": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "hien.trandoan": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "td hien": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "hien td": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "quantranhongle@gmail.com": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "quantranhongle": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "ley": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "ley quan": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "quan ley": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "manh.nguyenviet@glinteco.com": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "manh.nguyenviet": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "nguyễn việt mạnh": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "mạnh nguyễn việt": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "phuongkieuht11@gmail.com": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "phuongkieuht11": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "kiều tuấn phương": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "phương kiều tuấn": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "trangcao13@gmail.com": "cac305eb-d308-4115-b472-3f40c4629946",
  "trangcao13": "cac305eb-d308-4115-b472-3f40c4629946",
  "trang pham": "cac305eb-d308-4115-b472-3f40c4629946",
  "pham trang": "cac305eb-d308-4115-b472-3f40c4629946",
  "phuongmanhduc123@gmail.com": "9915b6dd-26a0-42f7-a619-94092ac1277a",
  "phuongmanhduc123": "9915b6dd-26a0-42f7-a619-94092ac1277a",
  "phuong manh duc": "9915b6dd-26a0-42f7-a619-94092ac1277a",
  "duc phuong manh": "9915b6dd-26a0-42f7-a619-94092ac1277a",
  "ngttuongvi25@gmail.com": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "ngttuongvi25": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "tường vi": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "vi tường": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "phamhung.bk94@gmail.com": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "phamhung.bk94": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "duc hung pham": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "pham duc hung": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "trangnn2908@gmail.com": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "trangnn2908": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "nguyễn ngọc tráng": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "tráng nguyễn ngọc": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "toanchan1402@gmail.com": "dd54a437-8b30-41d6-9870-28591d557d24",
  "toanchan1402": "dd54a437-8b30-41d6-9870-28591d557d24",
  "toantd": "dd54a437-8b30-41d6-9870-28591d557d24",
  "letuankhanh22102005@gmail.com": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "letuankhanh22102005": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "lê khanh": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "khanh lê": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "nguyenvu.dev.io@gmail.com": "2bd3075e-6851-46d7-bd58-1bc70109341c",
  "nguyenvu.dev.io": "2bd3075e-6851-46d7-bd58-1bc70109341c",
  "vunguyen": "2bd3075e-6851-46d7-bd58-1bc70109341c",
  "nhungnguyen.neu.ktc@gmail.com": "693e967b-a801-45bb-8713-061fb2da857b",
  "nhungnguyen.neu.ktc": "693e967b-a801-45bb-8713-061fb2da857b",
  "nhung nguyễn": "693e967b-a801-45bb-8713-061fb2da857b",
  "hangnt@vietplastic.vn": "74abc795-c77f-450f-894f-2817beb27d76",
  "hangnt": "74abc795-c77f-450f-894f-2817beb27d76",
  "thanh hang": "74abc795-c77f-450f-894f-2817beb27d76",
  "hang thanh": "74abc795-c77f-450f-894f-2817beb27d76",
  "phongpcbyl@gmail.com": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "phongpcbyl": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "phong đỗ nguyễn hùng": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "hùng phong đỗ nguyễn": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "maianhngxvu@gmail.com": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "maianhngxvu": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "ánh mai": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "mai ánh": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "nguyenbaolien@gmail.com": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "nguyenbaolien": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "nguyễn bảo liên": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "liên nguyễn bảo": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "nguyenhieu26033@gmail.com": "17a178c1-2785-4a36-808d-670f747b013f",
  "nguyenhieu26033": "17a178c1-2785-4a36-808d-670f747b013f",
  "hieu nguyen": "17a178c1-2785-4a36-808d-670f747b013f",
  "nguyen hieu": "17a178c1-2785-4a36-808d-670f747b013f",
  "kienht@vietplastic.vn": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
  "kienht": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
  "kien tuanho": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
  "tuanho kien": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
  "anhdm@vietplastic.vn": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
  "anhdm": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
  "minh anh": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
  "anh minh": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
  "vuduc07092005@gmail.com": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "vuduc07092005": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "vu anh duc": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "duc vu anh": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "quang15072005@gmail.com": "2b2cfb95-fb99-426d-9d2f-cd17dba5a883",
  "quang15072005": "2b2cfb95-fb99-426d-9d2f-cd17dba5a883",
  "quang minh": "2b2cfb95-fb99-426d-9d2f-cd17dba5a883",
  "trmianhh270503@gmail.com": "906a873f-9d03-48b2-b8b4-a7fc495e1838",
  "trmianhh270503": "906a873f-9d03-48b2-b8b4-a7fc495e1838",
  "minh anh tran design": "906a873f-9d03-48b2-b8b4-a7fc495e1838",
  "design minh anh tran": "906a873f-9d03-48b2-b8b4-a7fc495e1838",
  "nguyenvythao61@gmail.com": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "nguyenvythao61": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "vy nguyễn thảo": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "thảo vy nguyễn": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "lamgiaoda@gmail.com": "c58a270b-5f0d-41f7-a828-59d83b1ae5b2",
  "lamgiaoda": "c58a270b-5f0d-41f7-a828-59d83b1ae5b2",
  "nguyễn tùng lâm": "c58a270b-5f0d-41f7-a828-59d83b1ae5b2",
  "lâm nguyễn tùng": "c58a270b-5f0d-41f7-a828-59d83b1ae5b2",
  "nda1112f@gmail.com": "f023ed90-8ff8-4c22-b4a8-8ba17df78728",
  "nda1112f": "f023ed90-8ff8-4c22-b4a8-8ba17df78728",
  "phùng đức anh": "f023ed90-8ff8-4c22-b4a8-8ba17df78728",
  "anh phùng đức": "f023ed90-8ff8-4c22-b4a8-8ba17df78728",
  "lethemi436@gmail.com": "9c370807-d191-4849-8f46-2306627c4886",
  "lethemi436": "9c370807-d191-4849-8f46-2306627c4886",
  "mỹ lê thế": "9c370807-d191-4849-8f46-2306627c4886",
  "thế mỹ lê": "9c370807-d191-4849-8f46-2306627c4886",
  "hientd1310@gmail.com": "3bbac0cf-4ddd-4f5f-b36b-34e5497c5644",
  "hientd1310": "3bbac0cf-4ddd-4f5f-b36b-34e5497c5644",
  "hien tran doan": "3bbac0cf-4ddd-4f5f-b36b-34e5497c5644",
  "doan hien tran": "3bbac0cf-4ddd-4f5f-b36b-34e5497c5644",
  "developers@glinteco.com": "84f4b285-6aec-436c-a32d-022b3ef0c216",
  "developers": "84f4b285-6aec-436c-a32d-022b3ef0c216",
  "glinteco developer": "84f4b285-6aec-436c-a32d-022b3ef0c216",
  "developer glinteco": "84f4b285-6aec-436c-a32d-022b3ef0c216",
  "trang.phamthu@glinteco.com": "742e08d1-5997-4069-8bbc-42f32d0b014e",
  "trang.phamthu": "742e08d1-5997-4069-8bbc-42f32d0b014e",
  "trang pham thu": "742e08d1-5997-4069-8bbc-42f32d0b014e",
  "thu trang pham": "742e08d1-5997-4069-8bbc-42f32d0b014e",
  "datnt114@gmail.com": "06fc141d-fe49-4073-bf02-542c873cd285",
  "datnt114": "06fc141d-fe49-4073-bf02-542c873cd285",
  "tiến đạt nguyễn": "06fc141d-fe49-4073-bf02-542c873cd285",
  "nguyễn tiến đạt": "06fc141d-fe49-4073-bf02-542c873cd285",
  "bot_user_c2859c39-ff43-40c6-b428-65b24b28efda@plane-production-d361.up.railway.app": "6c0d3123-e4ed-457d-ac50-28f2471c57f4",
  "bot_user_c2859c39-ff43-40c6-b428-65b24b28efda": "6c0d3123-e4ed-457d-ac50-28f2471c57f4",
  "plane": "6c0d3123-e4ed-457d-ac50-28f2471c57f4",
  "hoa.vuquang@glinteco.com": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "hoa.vuquang": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "vu quang hoa": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "quang hoa vu": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "phamhung": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "hung pham": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "hùng phạm": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0",
  "đức hùng phạm": "8ad0e2eb-5ce1-40ee-aa03-a14c872922c0"
};

export async function resolvePlaneUserId(
  slackUserId: string,
  slackClient: SlackClient,
  env: Env,
  planeClient?: PlaneClient,
  projectId?: string
): Promise<{ id: string | null; name: string }> {
  if (!slackUserId) {
    return { id: null, name: "" };
  }

  // 1. Kiểm tra cache trong KV (chỉ tái sử dụng nếu id hợp lệ, không dùng cache null)
  try {
    const cached = await env.KV.get(`plane_user_map:${slackUserId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.id) {
        return { id: parsed.id, name: parsed.name };
      }
    }
  } catch (e) {
    console.warn("KV read error for Plane user map:", e);
  }

  // 2. Lấy thông tin user từ Slack API
  try {
    const slackUser = await slackClient.getUserInfo(slackUserId);
    if (!slackUser) {
      return { id: null, name: "" };
    }

    const profile = slackUser.profile || {};
    const email = (profile.email || "").trim().toLowerCase();
    const emailPrefix = email ? email.split("@")[0].trim().toLowerCase() : "";
    const displayName = (profile.display_name || "").trim();
    const realName = (profile.real_name || slackUser.real_name || "").trim();
    const username = (slackUser.name || "").trim();

    // 3. Dynamic lookup qua Plane API (so khớp email 1-1 theo thời gian thực)
    if (planeClient) {
      try {
        const targetProjectId = projectId || env.PLANE_DEFAULT_PROJECT_ID || "e92f7ba8-0db9-487f-a21c-13712d226eb8";
        const projectMembers = await planeClient.getProjectMembers(targetProjectId);

        const findInList = (list: any[]) => {
          if (!list || list.length === 0) return null;

          // A. So khớp chính xác email (Độ ưu tiên số 1 - 100% chuẩn xác)
          if (email) {
            const memberByEmail = list.find(
              (m) => m.email && m.email.toLowerCase().trim() === email
            );
            if (memberByEmail) return memberByEmail;
          }

          // B. So khớp theo username prefix từ email (ví dụ: hung.phamduc)
          if (emailPrefix) {
            const memberByPrefix = list.find(
              (m) => m.email && m.email.split("@")[0].toLowerCase().trim() === emailPrefix
            );
            if (memberByPrefix) return memberByPrefix;
          }

          // C. So khớp theo tên hiển thị / họ tên
          for (const rawName of [displayName, realName, username]) {
            if (!rawName) continue;
            const nameLower = rawName.toLowerCase();
            const memberByName = list.find((m) => {
              const mDisplay = (m.display_name || "").toLowerCase();
              const mFull = `${m.first_name || ""} ${m.last_name || ""}`.trim().toLowerCase();
              const mRev = `${m.last_name || ""} ${m.first_name || ""}`.trim().toLowerCase();
              return mDisplay === nameLower || mFull === nameLower || mRev === nameLower;
            });
            if (memberByName) return memberByName;
          }

          return null;
        };

        let matched = findInList(projectMembers);
        if (!matched) {
          // Nếu chưa có trong project, kiểm tra trong toàn bộ workspace
          const wsMembers = await planeClient.getWorkspaceMembers();
          matched = findInList(wsMembers);
        }

        if (matched) {
          const name =
            matched.display_name ||
            `${matched.first_name || ""} ${matched.last_name || ""}`.trim() ||
            displayName ||
            realName;
          await env.KV.put(
            `plane_user_map:${slackUserId}`,
            JSON.stringify({ id: matched.id, name }),
            { expirationTtl: 60 * 60 * 24 * 7 }
          );
          return { id: matched.id, name };
        }
      } catch (planeErr) {
        console.warn("Lỗi dynamic lookup Plane members:", planeErr);
      }
    }

    // 4. Static fallback mapping (Tra cứu từ danh bạ 61 thành viên của Plane)
    const candidates = [
      email,
      emailPrefix,
      displayName,
      realName,
      username,
    ].filter(Boolean);

    for (const rawName of candidates) {
      const nameLower = rawName.trim().toLowerCase();
      if (INITIAL_SLACK_TO_PLANE_USERS[nameLower]) {
        const matchedId = INITIAL_SLACK_TO_PLANE_USERS[nameLower];
        await env.KV.put(
          `plane_user_map:${slackUserId}`,
          JSON.stringify({ id: matchedId, name: rawName }),
          { expirationTtl: 60 * 60 * 24 * 7 }
        );
        return { id: matchedId, name: rawName };
      }
    }

    return { id: null, name: candidates[1] || candidates[0] || "" };
  } catch (e) {
    console.error("Error resolving Plane user ID:", e);
    return { id: null, name: "" };
  }
}

export async function resolveClickUpUserId(
  slackUserId: string,
  slackClient: SlackClient,
  env: Env
): Promise<{ id: number | null; name: string }> {
  if (!slackUserId) {
    return { id: null, name: "" };
  }

  // 1. Kiểm tra cache trong KV
  try {
    const cached = await env.KV.get(`user_map:${slackUserId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { id: parsed.id, name: parsed.name };
    }
  } catch (e) {
    console.warn("KV read error for user map:", e);
  }

  // 2. Lấy thông tin user từ Slack API
  try {
    const slackUser = await slackClient.getUserInfo(slackUserId);
    if (!slackUser) {
      return { id: null, name: "" };
    }

    const profile = slackUser.profile || {};
    const candidates = [
      profile.display_name,
      profile.real_name,
      slackUser.real_name,
      slackUser.name,
    ].filter(Boolean);

    for (const rawName of candidates) {
      const nameLower = rawName.trim().toLowerCase();
      if (INITIAL_SLACK_TO_CLICKUP_USERS[nameLower]) {
        const matchedId = INITIAL_SLACK_TO_CLICKUP_USERS[nameLower];
        // Lưu vào KV cache 7 ngày
        await env.KV.put(
          `user_map:${slackUserId}`,
          JSON.stringify({ id: matchedId, name: rawName }),
          { expirationTtl: 60 * 60 * 24 * 7 }
        );
        return { id: matchedId, name: rawName };
      }
    }

    return { id: null, name: candidates[0] || "" };
  } catch (e) {
    console.error("Error resolving ClickUp user ID:", e);
    return { id: null, name: "" };
  }
}
