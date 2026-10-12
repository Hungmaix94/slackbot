import { Env } from "../config/env";
import { GeminiClient } from "../ai/gemini";
import { WorkersAiClient } from "../ai/workers-ai";

export interface AiClientInstance {
  client: GeminiClient | WorkersAiClient;
  provider: "cloudflare-workers-ai" | "gemini";
  model: string;
}

export function createAiClient(env: Env): AiClientInstance {
  const useWorkersAi = env.AI_PROVIDER === "cloudflare" || !env.GEMINI_API_KEY;

  if (useWorkersAi && env.AI) {
    return {
      client: new WorkersAiClient(env),
      provider: "cloudflare-workers-ai",
      model: env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct",
    };
  }

  return {
    client: new GeminiClient(env),
    provider: "gemini",
    model: env.DEFAULT_MODEL || "gemini-3.6-flash",
  };
}
