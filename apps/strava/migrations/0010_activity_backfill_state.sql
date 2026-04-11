-- Track adapter backfill attempts so empty/unsupported activities are not retried forever.

CREATE TABLE IF NOT EXISTS activity_backfill_state (
  activity_id BIGINT PRIMARY KEY REFERENCES activities(strava_activity_id) ON DELETE CASCADE,
  stream_backfill_checked_at TIMESTAMP,
  stream_backfill_last_stream_count INTEGER,
  watts_stream_missing_checked_at TIMESTAMP,
  segment_backfill_checked_at TIMESTAMP,
  segment_backfill_last_effort_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_backfill_state_stream_checked_at
  ON activity_backfill_state(stream_backfill_checked_at);

CREATE INDEX IF NOT EXISTS idx_activity_backfill_state_segment_checked_at
  ON activity_backfill_state(segment_backfill_checked_at);
