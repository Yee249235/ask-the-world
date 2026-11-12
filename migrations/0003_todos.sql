-- 开窗之后的待办清单
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  question_id TEXT,          -- 从哪个问题来的（可选）
  created_at INTEGER NOT NULL,
  done_at INTEGER
);
