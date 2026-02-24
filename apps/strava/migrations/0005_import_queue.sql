-- Import queue/worker support (MVP3)
-- Adds database-backed import jobs for async processing.

CREATE TABLE IF NOT EXISTS import_jobs (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  import_file_id BIGINT NOT NULL REFERENCES import_files(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|processing|done|failed
  priority INTEGER NOT NULL DEFAULT 100,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_available
  ON import_jobs(status, available_at, id);

CREATE INDEX IF NOT EXISTS idx_import_jobs_import_id
  ON import_jobs(import_id);

CREATE INDEX IF NOT EXISTS idx_import_jobs_import_file_id
  ON import_jobs(import_file_id);
