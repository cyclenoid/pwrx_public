-- Local segments and auto-climb support (Phase 3 MVP)
-- Extends existing segment tables so local file imports can generate efforts without Strava data.

-- Negative IDs for synthetic local segments and efforts.
CREATE SEQUENCE IF NOT EXISTS local_segment_id_seq
  AS BIGINT
  INCREMENT BY -1
  MINVALUE -9223372036854775808
  MAXVALUE -1
  START WITH -1;

CREATE SEQUENCE IF NOT EXISTS local_segment_effort_id_seq
  AS BIGINT
  INCREMENT BY -1
  MINVALUE -9223372036854775808
  MAXVALUE -1
  START WITH -1;

ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'strava',
  ADD COLUMN IF NOT EXISTS local_fingerprint VARCHAR(160),
  ADD COLUMN IF NOT EXISTS is_auto_climb BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE segment_efforts
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'strava';

CREATE INDEX IF NOT EXISTS idx_segments_source
  ON segments(source);

CREATE INDEX IF NOT EXISTS idx_segments_auto_climb
  ON segments(is_auto_climb);

CREATE UNIQUE INDEX IF NOT EXISTS idx_segments_local_fingerprint
  ON segments(local_fingerprint)
  WHERE local_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_segment_efforts_source
  ON segment_efforts(source);

CREATE UNIQUE INDEX IF NOT EXISTS idx_segment_efforts_local_unique
  ON segment_efforts(segment_id, activity_id, start_index, end_index)
  WHERE source = 'local';
