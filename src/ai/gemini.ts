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
    this.model = model || env.DEFAULT_MODEL || "gemini-2.5-flash";
    this.gatewayUrl = env.CF_AI_GATEWAY_URL;
  }

  private getEndpoint(): string {
    if (this.gatewayUrl) {
      // Dùng Cloudflare AI Gateway
      const cleanGateway = this.gatewayUrl.replace(/\/+$/, "");
      return `${cleanGateway}/google-ai-studio/v1beta/models/${this.model}:generateContent`;
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
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
    const endpoint = this.getEndpoint();
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

    if (params.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: params.systemInstruction }],
      };
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
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
  }
}
