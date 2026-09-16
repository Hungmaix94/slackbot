/**
 * Xác thực chữ ký Slack (HMAC-SHA256) sử dụng Web Crypto API chuẩn
 */
export async function verifySlackSignature(
  signingSecret: string,
  signature: string | null,
  timestamp: string | null,
  rawBody: string
): Promise<boolean> {
  if (!signature || !timestamp || !signingSecret) {
    return false;
  }

  // 1. Kiểm tra timestamp không được lệch quá 5 phút (chống Replay Attack)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || reqTime < fiveMinutesAgo) {
    return false;
  }

  // 2. Tạo chuỗi base: v0:timestamp:rawBody
  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(sigBaseString)
  );

  // Convert buffer to hex
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const mySignature = "v0=" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time comparison
  return timingSafeEqual(mySignature, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
