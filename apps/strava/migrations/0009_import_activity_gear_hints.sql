-- Stores optional gear assignment hints for imported file activities, keyed by Strava external activity id.

CREATE TABLE IF NOT EXISTS import_activity_gear_hints (
  external_id TEXT PRIMARY KEY,
  gear_id TEXT NOT NULL REFERENCES gear(id) ON DELETE CASCADE,
  source VARCHAR(64) NOT NULL DEFAULT 'strava_activities_csv',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_activity_gear_hints_gear_id
  ON import_activity_gear_hints (gear_id);

CREATE INDEX IF NOT EXISTS idx_import_activity_gear_hints_updated_at
  ON import_activity_gear_hints (updated_at DESC);
