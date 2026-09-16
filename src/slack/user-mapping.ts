import { Env } from "../config/env";
import { SlackClient } from "./client";

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
  "phamhung.bk94@gmail.com": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "duc hung pham": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "pham hung": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "phamhung": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "đức hùng phạm": "d40f4be8-a23e-42c6-8dc6-5206ba0c57c8",
  "khoa.nguyencong@glinteco.com": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "khoa nguyễn": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "khoa nguyen": "d71fdb22-f20d-4465-a90c-90ee4cc26572",
  "hien.trandoan@glinteco.com": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "td hien": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "hien td": "2323275e-6b9a-4147-8aa7-b0afe9c40121",
  "hientd1310@gmail.com": "3bbac0cf-4ddd-4f5f-b36b-34e5497c5644",
  "phuongkieuht11@gmail.com": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "kiều tuấn phương": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "kieu tuan phuong": "85fd6462-6cea-4725-9169-432d5ae6cb07",
  "trangcao13@gmail.com": "cac305eb-d308-4115-b472-3f40c4629946",
  "trang pham": "cac305eb-d308-4115-b472-3f40c4629946",
  "trang phạm": "cac305eb-d308-4115-b472-3f40c4629946",
  "ngttuongvi25@gmail.com": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "tường vi": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "tuong vi": "5e8ec3d3-8941-4ec5-9c7d-1373151b1682",
  "nhungnguyen.neu.ktc@gmail.com": "693e967b-a801-45bb-8713-061fb2da857b",
  "nhung nguyễn": "693e967b-a801-45bb-8713-061fb2da857b",
  "nhung nguyen": "693e967b-a801-45bb-8713-061fb2da857b",
  "hangnt@vietplastic.vn": "74abc795-c77f-450f-894f-2817beb27d76",
  "hangnt": "74abc795-c77f-450f-894f-2817beb27d76",
  "phongpcbyl@gmail.com": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "phong đỗ nguyễn hùng": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "phong do nguyen hung": "bab30b0f-0a5b-4aec-8419-95fb66c69b21",
  "maianhngxvu@gmail.com": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "ánh mai": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "anh mai": "908d6018-00f8-4d30-9fa3-579332438ba7",
  "nguyenbaolien@gmail.com": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "nguyễn bảo liên": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "nguyen bao lien": "ca9809fb-92bf-4994-84b5-3eafd1717314",
  "nguyenhieu26033@gmail.com": "17a178c1-2785-4a36-808d-670f747b013f",
  "hieu nguyen": "17a178c1-2785-4a36-808d-670f747b013f",
  "hiếu nguyễn": "17a178c1-2785-4a36-808d-670f747b013f",
  "kienht@vietplastic.vn": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
  "kien tuanho": "a49208d9-27c9-4182-b769-ddc80ba4fbbf",
  "anhdm@vietplastic.vn": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
  "minh anh": "14466c4e-0c17-4af9-a00a-0af9f2775ee1",
  "vuduc07092005@gmail.com": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "vu anh duc": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "vũ anh đức": "b6ad9b74-e089-486e-8c7a-31b1769d2be5",
  "quang15072005@gmail.com": "2b2cfb95-fb99-426d-9d2f-cd17dba5a883",
  "minh quang": "2b2cfb95-fb99-426d-9d2f-cd17dba5a883",
  "trmianhh270503@gmail.com": "906a873f-9d03-48b2-b8b4-a7fc495e1838",
  "minh anh tran design": "906a873f-9d03-48b2-b8b4-a7fc495e1838",
  "nguyenvythao61@gmail.com": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "vy nguyễn thảo": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "vy nguyen thao": "40120851-e7d5-4ec6-9d4f-7ccf6e7d8793",
  "trangnn2908@gmail.com": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "nguyễn ngọc tráng": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "nguyen ngoc trang": "2c85f9c9-d663-4b15-a97d-4bde2fe3ccc0",
  "toanchan1402@gmail.com": "dd54a437-8b30-41d6-9870-28591d557d24",
  "toantd": "dd54a437-8b30-41d6-9870-28591d557d24",
  "letuankhanh22102005@gmail.com": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "lê khanh": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "le khanh": "b6686cd2-259e-4ae5-aabb-5c33c75066f8",
  "nguyenvu.dev.io@gmail.com": "2bd3075e-6851-46d7-bd58-1bc70109341c",
  "vunguyen": "2bd3075e-6851-46d7-bd58-1bc70109341c",
  "vu nguyen": "2bd3075e-6851-46d7-bd58-1bc70109341c",
  "phuongmanhduc123@gmail.com": "9915b6dd-26a0-42f7-a619-94092ac1277a",
  "phuong manh duc": "9915b6dd-26a0-42f7-a619-94092ac1277a",
  "manh.nguyenviet@glinteco.com": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "nguyễn việt mạnh": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "nguyen viet manh": "a8a221a1-ad81-4a34-92bc-34808a0502f0",
  "hoa.vuquang@glinteco.com": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "vu quang hoa": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "vũ quang hòa": "6292d351-72fb-4cc4-9f00-55fc818e981b",
  "quantranhongle@gmail.com": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "ley quan": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "lê quán trần hồng": "f99ae6f8-9021-46b4-b7ac-f00474c6c6e7",
  "developers@glinteco.com": "84f4b285-6aec-436c-a32d-022b3ef0c216",
  "developers": "84f4b285-6aec-436c-a32d-022b3ef0c216",
};

export async function resolvePlaneUserId(
  slackUserId: string,
  slackClient: SlackClient,
  env: Env
): Promise<{ id: string | null; name: string }> {
  if (!slackUserId) {
    return { id: null, name: "" };
  }

  // 1. Kiểm tra cache trong KV
  try {
    const cached = await env.KV.get(`plane_user_map:${slackUserId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { id: parsed.id, name: parsed.name };
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
    const candidates = [
      email,
      profile.display_name,
      profile.real_name,
      slackUser.real_name,
      slackUser.name,
    ].filter(Boolean);

    for (const rawName of candidates) {
      const nameLower = rawName.trim().toLowerCase();
      if (INITIAL_SLACK_TO_PLANE_USERS[nameLower]) {
        const matchedId = INITIAL_SLACK_TO_PLANE_USERS[nameLower];
        // Lưu vào KV cache 7 ngày
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
