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
