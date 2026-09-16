import { Env } from "../config/env";

export class WorkersAiService {
  private ai?: Ai;

  constructor(env: Env) {
    this.ai = env.AI;
  }

  /**
   * Sinh vector embedding cho văn bản bằng Workers AI (@cf/baai/bge-m3)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const res = await this.generateBatchEmbeddings([text]);
    return res[0] || [];
  }

  /**
   * Sinh vector embedding theo lô (Batch) giúp giảm subrequest và CPU time
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.ai || texts.length === 0) {
      return [];
    }

    try {
      const response: any = await this.ai.run("@cf/baai/bge-m3", {
        text: texts,
      });

      if (response && response.data) {
        return response.data;
      }
      return [];
    } catch (e) {
      console.error("Workers AI batch embedding error:", e);
      return [];
    }
  }

  /**
   * Fallback generation bằng Llama 3.3 nếu Gemini API gặp sự cố
   */
  async generateFallbackText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.ai) {
      return "Hệ thống AI hiện đang tạm thời gián đoạn kết nối.";
    }

    try {
      const messages: any[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      const response: any = await this.ai.run("@cf/meta/llama-3.1-70b-instruct", {
        messages,
      });

      return response?.response || "";
    } catch (e) {
      console.error("Workers AI generation error:", e);
      return "Lỗi khi sinh phản hồi từ Workers AI fallback.";
    }
  }
}

import { GeminiContent, GeminiFunctionDeclaration } from "./gemini";

export class WorkersAiClient {
  private ai: Ai;
  private model: string;

  constructor(env: Env, model?: string) {
    if (!env.AI) {
      throw new Error("Cloudflare Workers AI binding (env.AI) chưa được cấu hình.");
    }
    this.ai = env.AI;
    this.model = model || env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  }

  async generateContent(params: {
    contents: GeminiContent[];
    systemInstruction?: string;
    tools?: { functionDeclarations: GeminiFunctionDeclaration[] }[];
    temperature?: number;
  }): Promise<{
    text: string;
    functionCalls?: { name: string; args: Record<string, any> }[];
  }> {
    const messages: any[] = [];
    if (params.systemInstruction) {
      messages.push({ role: "system", content: params.systemInstruction });
    }

    for (const c of params.contents) {
      const role = c.role === "model" ? "assistant" : "user";
      for (const p of c.parts) {
        if (p.text) {
          messages.push({ role, content: p.text });
        } else if (p.functionCall) {
          messages.push({
            role: "assistant",
            content: `Gọi tool: ${p.functionCall.name}(${JSON.stringify(p.functionCall.args)})`,
          });
        } else if (p.functionResponse) {
          messages.push({
            role: "user",
            content: `Kết quả từ tool ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response)}`,
          });
        }
      }
    }

    let cfTools: any[] | undefined = undefined;
    if (params.tools && params.tools.length > 0) {
      cfTools = [];
      for (const t of params.tools) {
        for (const f of t.functionDeclarations) {
          cfTools.push({
            type: "function",
            function: {
              name: f.name,
              description: f.description,
              parameters: {
                type: "object",
                properties: f.parameters?.properties || {},
                required: f.parameters?.required || [],
              },
            },
          });
        }
      }
    }

    const payload: any = {
      messages,
      max_tokens: 2200,
    };
    if (params.temperature !== undefined) {
      payload.temperature = params.temperature;
    }
    if (cfTools && cfTools.length > 0) {
      payload.tools = cfTools;
    }

    try {
      const response: any = await this.ai.run(this.model as any, payload);

      if (response?.tool_calls && response.tool_calls.length > 0 && cfTools && cfTools.length > 0) {
        const functionCalls = response.tool_calls
          .map((tc: any) => {
            const fn = tc.function || tc;
            let args = {};
            try {
              args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : (fn.arguments || {});
            } catch {
              args = {};
            }
            return {
              name: fn.name || tc.name || "",
              args,
            };
          })
          .filter((f: any) => Boolean(f.name));
        return { text: response?.response || "", functionCalls };
      }

      const text = response?.response || "";

      // Chỉ tìm tool call bằng regex nếu tools thực sự được cung cấp cho lượt gọi này
      if (cfTools && cfTools.length > 0) {
        const textToolMatch =
          text.match(/Gọi tool:\s*([a-zA-Z0-9_]+)\s*\((.*?)\)/s) ||
          text.match(/([a-zA-Z0-9_]+)\s*\(\s*(\{.*?\})\s*\)/s) ||
          text.match(/```(?:json|tool_call)?\s*\{\s*"name"\s*:\s*"([^"]+)",\s*"args"\s*:\s*(\{.*?\})\s*\}\s*```/s);

        if (textToolMatch) {
          try {
            const name = textToolMatch[1];
            const args = JSON.parse(textToolMatch[2]);
            if (args.path && !args.filePath) {
              args.filePath = args.path;
            }
            return { text: text, functionCalls: [{ name, args }] };
          } catch {}
        }
      }

      return { text };
    } catch (e: any) {
      console.error("Workers AI error:", e);
      throw new Error(`Workers AI execution error: ${e.message || String(e)}`);
    }
  }
}

