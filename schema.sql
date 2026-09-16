-- D1 Schema for MVL Assistant Slackbot

CREATE TABLE IF NOT EXISTS srs_documents (
  id TEXT PRIMARY KEY,               -- e.g. features/booking/brd.md
  domain TEXT NOT NULL,              -- e.g. booking, hrm, sales
  doc_type TEXT NOT NULL,            -- brd, fsd, test-spec, discovery, other
  title TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS srs_chunks (
  id TEXT PRIMARY KEY,               -- e.g. features/booking/brd.md#chunk-1
  doc_id TEXT NOT NULL REFERENCES srs_documents(id) ON DELETE CASCADE,
  heading TEXT,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  token_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_srs_chunks_doc_id ON srs_chunks(doc_id);

-- FTS5 table for fast hybrid keyword search
CREATE VIRTUAL TABLE IF NOT EXISTS srs_chunks_fts USING fts5(
  id UNINDEXED,
  heading,
  content,
  content=srs_chunks,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync with srs_chunks
CREATE TRIGGER IF NOT EXISTS srs_chunks_ai AFTER INSERT ON srs_chunks BEGIN
  INSERT INTO srs_chunks_fts(rowid, id, heading, content) VALUES (new.rowid, new.id, new.heading, new.content);
END;

CREATE TRIGGER IF NOT EXISTS srs_chunks_ad AFTER DELETE ON srs_chunks BEGIN
  INSERT INTO srs_chunks_fts(srs_chunks_fts, rowid, id, heading, content) VALUES('delete', old.rowid, old.id, old.heading, old.content);
END;

CREATE TRIGGER IF NOT EXISTS srs_chunks_au AFTER UPDATE ON srs_chunks BEGIN
  INSERT INTO srs_chunks_fts(srs_chunks_fts, rowid, id, heading, content) VALUES('delete', old.rowid, old.id, old.heading, old.content);
  INSERT INTO srs_chunks_fts(rowid, id, heading, content) VALUES (new.rowid, new.id, new.heading, new.content);
END;

-- Thread conversation memory
CREATE TABLE IF NOT EXISTS slack_threads (
  thread_ts TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  intent TEXT,
  summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User mapping table (Slack User <-> ClickUp Member ID)
CREATE TABLE IF NOT EXISTS user_mappings (
  slack_user_id TEXT PRIMARY KEY,
  slack_name TEXT NOT NULL,
  clickup_user_id INTEGER NOT NULL,
  clickup_email TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
