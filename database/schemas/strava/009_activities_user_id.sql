-- Migration 009: Add user_id to activities for multi-user support
-- Links each activity to a specific user profile

-- Add user_id column to activities table
ALTER TABLE strava.activities
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES strava.user_profile(id) ON DELETE CASCADE;

-- Set user_id for all existing activities to the first user
UPDATE strava.activities
SET user_id = (SELECT id FROM strava.user_profile ORDER BY id LIMIT 1)
WHERE user_id IS NULL;

-- Make user_id required for future inserts
ALTER TABLE strava.activities
  ALTER COLUMN user_id SET NOT NULL;

-- Create index for efficient user-based queries
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON strava.activities(user_id);

-- Update the user_profile_complete view to show per-user statistics
DROP VIEW IF EXISTS strava.user_profile_complete CASCADE;

CREATE VIEW strava.user_profile_complete AS
SELECT
  up.id,
  up.strava_athlete_id,
  up.username,
  up.firstname,
  up.lastname,
  up.profile_photo,
  up.city,
  up.country,
  up.created_at,
  up.updated_at,
  up.strava_access_token,
  up.strava_refresh_token,
  up.strava_token_expires_at,
  up.strava_scope,
  up.last_sync_at,
  up.is_active,
  (SELECT json_object_agg(key, value) FROM strava.user_settings WHERE user_id = up.id) as settings,
  -- Per-user statistics
  (SELECT COUNT(*) FROM strava.activities WHERE user_id = up.id) as total_activities,
  (SELECT COALESCE(SUM(CAST(distance AS NUMERIC) / 1000), 0) FROM strava.activities WHERE user_id = up.id) as total_distance_km,
  (SELECT COUNT(*) FROM strava.activities WHERE user_id = up.id AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)) as activities_this_year
FROM strava.user_profile up;

COMMENT ON COLUMN strava.activities.user_id IS 'Foreign key to user_profile - owner of this activity';
