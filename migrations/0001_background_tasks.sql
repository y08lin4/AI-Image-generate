CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  ratio TEXT NOT NULL,
  resolution TEXT NOT NULL,
  size TEXT NOT NULL,
  model TEXT NOT NULL,
  count INTEGER NOT NULL,
  concurrency INTEGER NOT NULL,
  request_json TEXT NOT NULL,
  results_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  workflow_id TEXT,
  retry_of TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS stats (
  stat_key TEXT PRIMARY KEY,
  stat_value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
