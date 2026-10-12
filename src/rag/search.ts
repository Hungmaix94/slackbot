import { Env } from "../config/env";
import { WorkersAiService } from "../ai/workers-ai";

export interface SearchResult {
  id: string;
  docId: string;
  heading: string;
  content: string;
  score?: number;
}

const VIETNAMESE_STOP_WORDS = new Set([
  "và", "hoặc", "là", "gì", "nhau", "thế", "nào", "ở", "đâu", "tại", "sao", "như",
  "được", "không", "có", "cho", "với", "của", "về", "trong", "các", "những", "một",
  "này", "đó", "kia", "test", "thử", "hỏi", "xem", "tìm", "mình", "tôi", "giúp",
  "cho", "ra", "lại", "đang", "đã", "sẽ", "phải", "khi", "nếu", "bị", "bởi",
  "khác", "giống", "so", "sánh", "phân", "biệt", "nghĩa"
]);

/**
 * Trích xuất danh sách cụm từ (phrases) và từ khóa chính để tạo truy vấn FTS5
 */
export function extractSearchTerms(rawQuery: string): string[] {
  const normalized = rawQuery
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const words = normalized.split(" ").filter((w) => w.length > 0);
  const phraseChunks: string[] = [];
  let currentChunk: string[] = [];

  for (const w of words) {
    if (VIETNAMESE_STOP_WORDS.has(w.toLowerCase())) {
      if (currentChunk.length > 0) {
        phraseChunks.push(currentChunk.join(" "));
        currentChunk = [];
      }
    } else {
      currentChunk.push(w);
    }
  }
  if (currentChunk.length > 0) {
    phraseChunks.push(currentChunk.join(" "));
  }

  const phrases = new Set<string>();
  const tokens = new Set<string>();

  for (const chunk of phraseChunks) {
    const chunkWords = chunk.split(" ");
    if (chunkWords.length >= 2) {
      phrases.add(`"${chunk}"`);
      if (chunkWords.length > 2) {
        for (let i = 0; i <= chunkWords.length - 2; i++) {
          phrases.add(`"${chunkWords[i]} ${chunkWords[i + 1]}"`);
        }
      }
    } else if (chunkWords.length === 1 && chunkWords[0].length >= 2) {
      tokens.add(`"${chunkWords[0]}"`);
    }
  }

  // Priority: longest phrases first, then 2-grams, then single tokens
  const sortedPhrases = Array.from(phrases).sort((a, b) => b.length - a.length);
  return [...sortedPhrases, ...Array.from(tokens)];
}

export class SrsSearchService {
  private env: Env;
  private aiService: WorkersAiService;

  constructor(env: Env) {
    this.env = env;
    this.aiService = new WorkersAiService(env);
  }

  /**
   * Tìm kiếm lai (Hybrid Search): FTS5 BM25 Keyword Matching (ưu tiên số 1) + Vectorize Semantic
   */
  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const results: Map<string, SearchResult> = new Map();

    // 1. Tìm kiếm Full-Text Search (FTS5) trên D1
    try {
      const terms = extractSearchTerms(query);
      if (terms.length > 0) {
        // Lấy tối đa 5 cụm từ quan trọng nhất ghép OR
        const matchExpr = terms.slice(0, 5).join(" OR ");
        const ftsQuery = `
          SELECT s.id, s.doc_id as docId, s.heading, s.content, f.rank as score
          FROM srs_chunks_fts f
          JOIN srs_chunks s ON f.rowid = s.rowid
          WHERE srs_chunks_fts MATCH ?
          ORDER BY f.rank ASC
          LIMIT ?
        `;
        const ftsRes = await this.env.DB.prepare(ftsQuery)
          .bind(matchExpr, limit)
          .all<SearchResult>();

        for (const row of ftsRes.results || []) {
          results.set(row.id, row);
        }
      }
    } catch (e) {
      console.warn("FTS5 search error on D1:", e);
    }

    // 2. Nếu FTS5 chưa đủ limit kết quả, bổ sung bằng Vectorize Semantic Search
    if (results.size < limit && this.env.VECTORIZE) {
      try {
        const queryVector = await this.aiService.generateEmbedding(query);
        if (queryVector.length > 0) {
          const vecRes = await this.env.VECTORIZE.query(queryVector, {
            topK: limit,
          });

          if (vecRes.matches && vecRes.matches.length > 0) {
            const chunkIds = vecRes.matches.map((m) => m.id);
            const placeholders = chunkIds.map(() => "?").join(",");
            const d1Res = await this.env.DB.prepare(
              `SELECT id, doc_id as docId, heading, content FROM srs_chunks WHERE id IN (${placeholders})`
            )
              .bind(...chunkIds)
              .all<SearchResult>();

            for (const row of d1Res.results || []) {
              if (!results.has(row.id)) {
                results.set(row.id, row);
                if (results.size >= limit) break;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Vectorize search error, falling back:", e);
      }
    }

    // 3. Fallback: Nếu cả FTS5 và Vectorize không tìm thấy gì, dùng LIKE với cụm từ dài nhất
    if (results.size === 0) {
      try {
        const words = query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => !VIETNAMESE_STOP_WORDS.has(w) && w.length >= 2)
          .sort((a, b) => b.length - a.length);

        if (words.length > 0) {
          const pattern1 = `%${words[0]}%`;
          const pattern2 = words.length > 1 ? `%${words[1]}%` : pattern1;
          const d1Rows = await this.env.DB.prepare(
            `SELECT id, doc_id as docId, heading, content FROM srs_chunks 
             WHERE (content LIKE ? OR heading LIKE ?) 
                OR (content LIKE ? OR heading LIKE ?)
             LIMIT ?`
          )
            .bind(pattern1, pattern1, pattern2, pattern2, limit)
            .all<SearchResult>();

          for (const row of d1Rows.results || []) {
            results.set(row.id, row);
          }
        }
      } catch (e) {
        console.warn("Fallback LIKE search error on D1:", e);
      }
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
