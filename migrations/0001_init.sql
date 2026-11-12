-- 问世界 · 数据库结构

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '❓',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🧭',
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', -- active | done
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  topic_id TEXT,
  parent_id TEXT,              -- 由哪个问题追问而来
  ask_by TEXT NOT NULL DEFAULT 'self', -- self | ai（追问是自己问的还是采纳 AI 建议）
  answer TEXT NOT NULL DEFAULT '',
  source TEXT,                 -- site_ai | external_ai | self
  source_model TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  suggest TEXT,                -- AI 建议（JSON），等待确认
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_q_created ON questions(created_at);
CREATE INDEX IF NOT EXISTS idx_q_parent ON questions(parent_id);

-- AI 发现的跨时间关联（回顾网络图里的虚线）
CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
