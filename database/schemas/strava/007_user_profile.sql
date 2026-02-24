-- User Profile Table
-- Stores user profile information for multi-user support

CREATE TABLE IF NOT EXISTS strava.user_profile (
  id SERIAL PRIMARY KEY,
  strava_athlete_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(100),
  firstname VARCHAR(100),
  lastname VARCHAR(100),
  profile_photo VARCHAR(500),
  city VARCHAR(100),
  country VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add user_id foreign key to user_settings to support multiple users
ALTER TABLE strava.user_settings
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES strava.user_profile(id) ON DELETE CASCADE;

-- Drop old unique constraint on key only
ALTER TABLE strava.user_settings DROP CONSTRAINT IF EXISTS user_settings_key_key;

-- Add new unique constraint on (user_id, key) for multi-user support
ALTER TABLE strava.user_settings DROP CONSTRAINT IF EXISTS user_settings_user_key_unique;
ALTER TABLE strava.user_settings ADD CONSTRAINT user_settings_user_key_unique UNIQUE (user_id, key);

-- For backwards compatibility, if user_id is NULL, it refers to the default user
-- Create default user if not exists
DO $$
DECLARE
  default_user_id INTEGER;
BEGIN
  -- Check if we have any user profile
  SELECT id INTO default_user_id FROM strava.user_profile LIMIT 1;

  -- If no user exists, create a default one
  IF default_user_id IS NULL THEN
    INSERT INTO strava.user_profile (strava_athlete_id, username, firstname)
    VALUES (0, 'default', 'Athlete')
    RETURNING id INTO default_user_id;
  END IF;

  -- Update existing settings to point to default user
  UPDATE strava.user_settings
  SET user_id = default_user_id
  WHERE user_id IS NULL;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON strava.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_athlete_id ON strava.user_profile(strava_athlete_id);

-- User Profile View with aggregated stats
CREATE OR REPLACE VIEW strava.user_profile_complete AS
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
  -- Get user settings as JSON
  (
    SELECT json_object_agg(key, value)
    FROM strava.user_settings
    WHERE user_id = up.id
  ) as settings,
  -- Activity stats
  (SELECT COUNT(*) FROM strava.activities) as total_activities,
  (SELECT COALESCE(SUM(CAST(distance AS NUMERIC) / 1000), 0) FROM strava.activities) as total_distance_km,
  (SELECT COUNT(*) FROM strava.activities WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)) as activities_this_year
FROM strava.user_profile up;

COMMENT ON TABLE strava.user_profile IS 'User profile information for multi-user support';
COMMENT ON VIEW strava.user_profile_complete IS 'Complete user profile with settings and stats';
