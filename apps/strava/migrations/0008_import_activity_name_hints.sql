-- Stores optional activity-name hints from Strava activities.csv imports.
-- Keys use prefixes:
--   id:<strava_activity_id>
--   file:<filename_stem>

CREATE TABLE IF NOT EXISTS import_activity_name_hints (
  hint_key TEXT PRIMARY KEY,
  activity_name TEXT NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'strava_activities_csv',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_activity_name_hints_source
  ON import_activity_name_hints (source);

CREATE INDEX IF NOT EXISTS idx_import_activity_name_hints_updated_at
  ON import_activity_name_hints (updated_at DESC);
