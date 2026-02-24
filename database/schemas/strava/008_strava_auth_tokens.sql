-- Migration 008: Add Strava OAuth tokens to user profile
-- This enables multi-user support with individual Strava connections

-- Add OAuth token fields to user_profile table
ALTER TABLE strava.user_profile
  ADD COLUMN IF NOT EXISTS strava_access_token VARCHAR(500),
  ADD COLUMN IF NOT EXISTS strava_refresh_token VARCHAR(500),
  ADD COLUMN IF NOT EXISTS strava_token_expires_at BIGINT,
  ADD COLUMN IF NOT EXISTS strava_scope VARCHAR(500),
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for finding active users
CREATE INDEX IF NOT EXISTS idx_user_profile_active ON strava.user_profile(is_active);

-- Drop and recreate the view to include new fields
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
  (SELECT COUNT(*) FROM strava.activities) as total_activities,
  (SELECT COALESCE(SUM(CAST(distance AS NUMERIC) / 1000), 0) FROM strava.activities) as total_distance_km,
  (SELECT COUNT(*) FROM strava.activities WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)) as activities_this_year
FROM strava.user_profile up;

-- Migrate existing .env token to the first user (if exists)
DO $$
DECLARE
  v_user_id INTEGER;
  v_refresh_token VARCHAR;
BEGIN
  -- Get the first user
  SELECT id INTO v_user_id FROM strava.user_profile ORDER BY id LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Note: The actual token from .env will need to be manually added or via API
    -- This just prepares the structure
    UPDATE strava.user_profile
    SET
      is_active = true,
      last_sync_at = CURRENT_TIMESTAMP
    WHERE id = v_user_id;

    RAISE NOTICE 'User profile % prepared for Strava token migration', v_user_id;
  END IF;
END $$;

COMMENT ON COLUMN strava.user_profile.strava_access_token IS 'OAuth access token for Strava API (short-lived)';
COMMENT ON COLUMN strava.user_profile.strava_refresh_token IS 'OAuth refresh token for Strava API (long-lived)';
COMMENT ON COLUMN strava.user_profile.strava_token_expires_at IS 'Unix timestamp when access token expires';
COMMENT ON COLUMN strava.user_profile.strava_scope IS 'OAuth scopes granted (e.g., read,activity:read_all)';
COMMENT ON COLUMN strava.user_profile.last_sync_at IS 'Timestamp of last successful Strava data sync';
COMMENT ON COLUMN strava.user_profile.is_active IS 'Whether this user profile is active and should be synced';
