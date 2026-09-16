import { Env } from "../config/env";
import { chunkMarkdown } from "./chunker";
import { WorkersAiService } from "../ai/workers-ai";

export interface IngestDocumentInput {
  path: string;
  content: string;
}

export async function ingestDocuments(
  env: Env,
  docs: IngestDocumentInput[]
): Promise<{ ingestedDocs: number; totalChunks: number }> {
  const ai = new WorkersAiService(env);
  let totalChunks = 0;

  for (const doc of docs) {
    const docId = doc.path.replace(/^\/+/, "");
    const parts = docId.split("/");
    const domain = parts[1] || "general";
    const filename = parts[parts.length - 1] || "doc.md";
    const docType = filename.split(".")[0] || "other";

    // 1. Lưu metadata tài liệu
    await env.DB.prepare(
      `INSERT INTO srs_documents (id, domain, doc_type, title, content_hash)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         content_hash = excluded.content_hash,
         updated_at = CURRENT_TIMESTAMP`
    )
      .bind(docId, domain, docType, filename, "hash_" + Date.now())
      .run();

    // 2. Xóa các chunk cũ của tài liệu này
    await env.DB.prepare(`DELETE FROM srs_chunks WHERE doc_id = ?`).bind(docId).run();

    // 3. Phân chia chunks mới
    const chunks = chunkMarkdown(docId, doc.content);
    totalChunks += chunks.length;

    if (chunks.length === 0) continue;

    // Lưu hàng loạt vào D1 bằng DB.batch
    const d1Statements = chunks.map((chunk) =>
      env.DB.prepare(
        `INSERT INTO srs_chunks (id, doc_id, heading, content, chunk_index)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(chunk.id, chunk.docId, chunk.heading, chunk.content, chunk.chunkIndex)
    );
    await env.DB.batch(d1Statements);

    // Sinh embedding hàng loạt trong 1 subrequest duy nhất bằng generateBatchEmbeddings
    if (env.VECTORIZE) {
      try {
        const texts = chunks.map((c) => c.content);
        const embeddings = await ai.generateBatchEmbeddings(texts);
        const vectorsToUpsert: VectorizeVector[] = [];

        embeddings.forEach((vec, idx) => {
          if (vec && vec.length > 0) {
            const chunk = chunks[idx];
            vectorsToUpsert.push({
              id: chunk.id,
              values: vec,
              metadata: {
                docId: chunk.docId,
                heading: chunk.heading,
              },
            });
          }
        });

        if (vectorsToUpsert.length > 0) {
          await env.VECTORIZE.upsert(vectorsToUpsert);
        }
      } catch (e) {
        console.warn(`Error generating batch embeddings for doc ${docId}:`, e);
      }
    }
  }

  return {
    ingestedDocs: docs.length,
    totalChunks,
  };
}
