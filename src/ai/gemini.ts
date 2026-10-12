import { Env } from "../config/env";

export interface GeminiContent {
  role: "user" | "model";
  parts: {
    text?: string;
    functionCall?: {
      name: string;
      args: Record<string, any>;
    };
    functionResponse?: {
      name: string;
      response: Record<string, any>;
    };
  }[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: "OBJECT";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        items?: { type: string };
      }
    >;
    required?: string[];
  };
}

export class GeminiClient {
  private apiKey: string;
  private model: string;
  private gatewayUrl?: string;

  constructor(env: Env, model?: string) {
    this.apiKey = env.GEMINI_API_KEY || "";
    this.model = model || env.DEFAULT_MODEL || "gemini-3.6-flash";
    this.gatewayUrl = env.CF_AI_GATEWAY_URL;
  }

  private getEndpoint(modelName?: string): string {
    const selected = modelName || this.model;
    if (this.gatewayUrl) {
      // Dùng Cloudflare AI Gateway
      const cleanGateway = this.gatewayUrl.replace(/\/+$/, "");
      return `${cleanGateway}/google-ai-studio/v1beta/models/${selected}:generateContent`;
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${selected}:generateContent?key=${this.apiKey}`;
  }

  async generateContent(params: {
    contents: GeminiContent[];
    systemInstruction?: string;
    tools?: { functionDeclarations: GeminiFunctionDeclaration[] }[];
    temperature?: number;
    responseMimeType?: string;
  }): Promise<{
    text: string;
    functionCalls?: { name: string; args: Record<string, any> }[];
  }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.gatewayUrl) {
      headers["x-goog-api-key"] = this.apiKey;
    }

    const body: any = {
      contents: params.contents,
      generationConfig: {
        temperature: params.temperature ?? 0.2,
      },
    };

    if (params.responseMimeType) {
      body.generationConfig.responseMimeType = params.responseMimeType;
    }

    if (params.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: params.systemInstruction }],
      };
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
    }

    const modelsToTry = Array.from(new Set([this.model, "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]));
    let lastError: any = null;

    for (const modelToUse of modelsToTry) {
      try {
        const endpoint = this.getEndpoint(modelToUse);
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 503 || res.status === 404) {
            console.warn(`Model ${modelToUse} returned ${res.status}, trying next fallback model...`);
            lastError = new Error(`Gemini API error (${res.status}): ${errText}`);
            continue;
          }
          throw new Error(`Gemini API error (${res.status}): ${errText}`);
        }

        const data: any = await res.json();
        const candidate = data.candidates?.[0];
        if (!candidate) {
          throw new Error("Gemini returned empty candidate response.");
        }

        const parts = candidate.content?.parts || [];
        let text = "";
        const functionCalls: { name: string; args: Record<string, any> }[] = [];

        for (const part of parts) {
          if (part.text) {
            text += part.text;
          }
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }

        return { text, functionCalls };
      } catch (err: any) {
        lastError = err;
        if (modelsToTry.indexOf(modelToUse) < modelsToTry.length - 1) {
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error("All Gemini models failed.");
  }
}
