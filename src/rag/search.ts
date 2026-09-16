import { Env } from "../config/env";
import { WorkersAiService } from "../ai/workers-ai";

export interface SearchResult {
  id: string;
  docId: string;
  heading: string;
  content: string;
  score?: number;
}

export class SrsSearchService {
  private env: Env;
  private aiService: WorkersAiService;

  constructor(env: Env) {
    this.env = env;
    this.aiService = new WorkersAiService(env);
  }

  /**
   * Tìm kiếm lai (Hybrid Search): Vectorize Semantic + D1 Full-text Keyword
   */
  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const results: Map<string, SearchResult> = new Map();

    // 1. Tìm kiếm ngữ nghĩa bằng Vectorize nếu có binding
    if (this.env.VECTORIZE) {
      try {
        const queryVector = await this.aiService.generateEmbedding(query);
        if (queryVector.length > 0) {
          const vecRes = await this.env.VECTORIZE.query(queryVector, {
            topK: limit,
          });

          if (vecRes.matches && vecRes.matches.length > 0) {
            const chunkIds = vecRes.matches.map((m) => m.id);
            // Lấy nội dung chi tiết từ D1
            const placeholders = chunkIds.map(() => "?").join(",");
            const d1Res = await this.env.DB.prepare(
              `SELECT id, doc_id as docId, heading, content FROM srs_chunks WHERE id IN (${placeholders})`
            )
              .bind(...chunkIds)
              .all<SearchResult>();

            for (const row of d1Res.results || []) {
              results.set(row.id, row);
            }
          }
        }
      } catch (e) {
        console.warn("Vectorize search error, falling back to D1 text search:", e);
      }
    }

    // 2. Tìm kiếm từ khóa bằng D1 FTS / LIKE
    try {
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2);

      if (keywords.length > 0) {
        // Ưu tiên tìm trong D1
        const likePattern = `%${keywords[0]}%`;
        const d1Rows = await this.env.DB.prepare(
          `SELECT id, doc_id as docId, heading, content FROM srs_chunks 
           WHERE content LIKE ? OR heading LIKE ? OR doc_id LIKE ? 
           LIMIT ?`
        )
          .bind(likePattern, likePattern, likePattern, limit)
          .all<SearchResult>();

        for (const row of d1Rows.results || []) {
          if (!results.has(row.id)) {
            results.set(row.id, row);
          }
        }
      }
    } catch (e) {
      console.warn("D1 keyword search error:", e);
    }

    return Array.from(results.values()).slice(0, limit);
  }

  /**
   * Đọc chi tiết toàn bộ một file SRS theo đường dẫn docId
   */
  async getDocumentContent(docId: string): Promise<string | null> {
    try {
      const res = await this.env.DB.prepare(
        `SELECT content FROM srs_chunks WHERE doc_id = ? ORDER BY chunk_index ASC`
      )
        .bind(docId)
        .all<{ content: string }>();

      if (res.results && res.results.length > 0) {
        return res.results.map((r) => r.content).join("\n\n");
      }
      return null;
    } catch (e) {
      console.error(`Error reading document ${docId} from D1:`, e);
      return null;
    }
  }
}
