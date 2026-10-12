import { GeminiContent, GeminiFunctionDeclaration } from "../ai/gemini";

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export interface ToolTraceItem {
  name: string;
  args: Record<string, any>;
  resultSnippet: string;
}

export type ToolDispatcher = (call: ToolCall) => Promise<string>;

export interface AgentRunnerOptions {
  aiClient: any;
  contents: GeminiContent[];
  systemInstruction: string;
  tools?: GeminiFunctionDeclaration[];
  toolDispatcher?: ToolDispatcher;
  maxTurns?: number;
}

export interface AgentRunnerResult {
  response: string;
  toolTrace: ToolTraceItem[];
  currentTurn: number;
  maxTurns: number;
  lastAiResponse?: any;
}
