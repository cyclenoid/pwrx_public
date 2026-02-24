-- Import pipeline baseline (MVP1 Slice A)
-- Adds import run tables and activity metadata for file-based imports.

-- Negative sequence for synthetic activity IDs used by local file imports.
CREATE SEQUENCE IF NOT EXISTS import_activity_id_seq
  AS BIGINT
  INCREMENT BY -1
  MINVALUE -9223372036854775808
  MAXVALUE -1
  START WITH -1;

-- Tracks one import run (single file, batch, watch folder).
CREATE TABLE IF NOT EXISTS imports (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL DEFAULT 'single', -- single|batch|watchfolder
  status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|processing|done|error|partial
  source VARCHAR(20) NOT NULL DEFAULT 'file', -- file|watchfolder|api
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  files_total INTEGER NOT NULL DEFAULT 0,
  files_ok INTEGER NOT NULL DEFAULT 0,
  files_skipped INTEGER NOT NULL DEFAULT 0,
  files_failed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tracks each file within an import run.
CREATE TABLE IF NOT EXISTS import_files (
  id BIGSERIAL PRIMARY KEY,
  import_id BIGINT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  path TEXT,
  original_filename TEXT NOT NULL,
  size_bytes BIGINT,
  sha256 VARCHAR(64) NOT NULL,
  detected_format VARCHAR(20), -- fit|gpx|tcx|zip|csv
  status VARCHAR(30) NOT NULL DEFAULT 'queued', -- queued|ok|skipped_duplicate|failed
  error_message TEXT,
  activity_id BIGINT REFERENCES activities(strava_activity_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extend activities for non-Strava sources and import linkage.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'strava',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(128),
  ADD COLUMN IF NOT EXISTS import_batch_id BIGINT REFERENCES imports(id) ON DELETE SET NULL;

-- Constraints and indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_files_sha256 ON import_files(sha256);
CREATE INDEX IF NOT EXISTS idx_import_files_import_id ON import_files(import_id);
CREATE INDEX IF NOT EXISTS idx_import_files_status ON import_files(status);
CREATE INDEX IF NOT EXISTS idx_imports_status_started_at ON imports(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_source ON activities(source);
CREATE INDEX IF NOT EXISTS idx_activities_import_batch_id ON activities(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_activities_fingerprint ON activities(fingerprint);
