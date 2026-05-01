CREATE TABLE IF NOT EXISTS task_image_chunks (
  task_id TEXT NOT NULL,
  result_index INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  mime TEXT NOT NULL,
  total_chunks INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (task_id, result_index, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_task_image_chunks_created_at ON task_image_chunks(created_at);
