import { Hono } from "hono";
import { Env } from "../config/env";
import { ingestDocuments } from "../rag/sync-webhook";

export const syncRoutes = new Hono<{ Bindings: Env }>();

// Ingest Webhook (Đồng bộ tài liệu SRS từ GitHub Actions / Webhook)
syncRoutes.post("/github", async (c) => {
  const secret = c.req.header("x-sync-secret");
  if (c.env.GITHUB_WEBHOOK_SECRET && secret !== c.env.GITHUB_WEBHOOK_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const body = await c.req.json();
  const documents = body.documents || [];

  if (!Array.isArray(documents) || documents.length === 0) {
    return c.json({ message: "No documents provided for sync." }, 400);
  }

  const result = await ingestDocuments(c.env, documents);
  return c.json({
    success: true,
    message: `Successfully synced ${result.ingestedDocs} documents (${result.totalChunks} chunks).`,
  });
});
