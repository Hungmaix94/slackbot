import { Hono } from "hono";
import { Env } from "../config/env";
import { classifyIntent } from "../agents/router";
import { AgentOrchestrator } from "../agents/orchestrator";

export const testRoutes = new Hono<{ Bindings: Env }>();

// Test Endpoint (cho phép kiểm tra trực tiếp phản hồi của AI / SRS QA)
testRoutes.post("/query", async (c) => {
  try {
    const body = await c.req.json();
    const query = body.query || "Quy trình kiểm thử dự án là gì?";
    const intent = classifyIntent(query);

    const orchestrator = new AgentOrchestrator(c.env);
    const result = await orchestrator.getSrsQaWorkflow().executeDirect({
      query,
      intent,
      history: body.history,
    });

    return c.json({
      query: result.query,
      intent: result.intent,
      provider: result.provider,
      model: result.model,
      srsCount: result.srsResults.length,
      toolTrace: result.toolTrace,
      response: result.response,
      debug: {
        currentTurn: result.currentTurn,
        maxTurns: result.maxTurns,
        rawAiResponse: result.lastAiResponse,
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || String(err), stack: err.stack }, 500);
  }
});
