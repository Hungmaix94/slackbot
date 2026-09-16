export interface Env {
  // Bindings
  KV: KVNamespace;
  DB: D1Database;
  VECTORIZE?: VectorizeIndex;
  R2?: R2Bucket;
  AI?: Ai;

  // Environment variables & Secrets
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  GEMINI_API_KEY?: string;
  AI_PROVIDER?: "cloudflare" | "gemini" | "openai" | "deepseek";
  WORKERS_AI_MODEL?: string;
  CLICKUP_API_TOKEN?: string;
  CLICKUP_DEFAULT_LIST_ID?: string;
  CF_AI_GATEWAY_URL?: string; // Optional: https://gateway.ai.cloudflare.com/v1/{account}/{gateway}
  GITHUB_TOKEN?: string;
  GITHUB_DEFAULT_ORG?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  DEFAULT_MODEL?: string;
}
