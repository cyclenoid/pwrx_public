-- Strava Activity Tracker Database Schema

-- Schema für Strava
CREATE SCHEMA IF NOT EXISTS strava;
SET search_path TO strava, public;

-- Tabelle: user_profile
-- Stores user profile information for multi-user support
CREATE TABLE IF NOT EXISTS user_profile (
    id SERIAL PRIMARY KEY,
    strava_athlete_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(100),
    firstname VARCHAR(100),
    lastname VARCHAR(100),
    profile_photo VARCHAR(500),
    city VARCHAR(100),
    country VARCHAR(100),
    strava_access_token VARCHAR(500),
    strava_refresh_token VARCHAR(500),
    strava_token_expires_at BIGINT,
    strava_scope VARCHAR(500),
    last_sync_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profile_athlete_id ON user_profile(strava_athlete_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_active ON user_profile(is_active);

-- Tabelle: user_settings
-- Stores user preferences and athlete data
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES user_profile(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, key)
);

-- Ensure a default user exists and attach existing settings
DO $$
DECLARE
  default_user_id INTEGER;
BEGIN
  SELECT id INTO default_user_id FROM user_profile LIMIT 1;

  IF default_user_id IS NULL THEN
    INSERT INTO user_profile (strava_athlete_id, username, firstname, is_active)
    VALUES (0, 'default', 'Athlete', true)
    RETURNING id INTO default_user_id;
  END IF;

  UPDATE user_settings
  SET user_id = default_user_id
  WHERE user_id IS NULL;
END $$;

-- Insert default weight (can be updated via API or synced from Strava)
INSERT INTO user_settings (user_id, key, value)
SELECT id, 'athlete_weight', '75'
FROM user_profile
WHERE strava_athlete_id = 0
ON CONFLICT (user_id, key) DO NOTHING;

-- Tabelle: activities
-- Stores information about each activity (runs, rides, etc.)
CREATE TABLE IF NOT EXISTS activities (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
    strava_activity_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(500),
    type VARCHAR(50), -- 'Run', 'Ride', 'Swim', etc.
    sport_type VARCHAR(50), -- 'TrailRun', 'GravelRide', 'MountainBikeRide', etc.
    start_date TIMESTAMP NOT NULL,
    start_date_local TIMESTAMP,
    timezone VARCHAR(100),
    distance DECIMAL(10, 2), -- meters
    moving_time INTEGER, -- seconds
    elapsed_time INTEGER, -- seconds
    total_elevation_gain DECIMAL(10, 2), -- meters
    average_speed DECIMAL(10, 2), -- m/s
    max_speed DECIMAL(10, 2), -- m/s
    average_heartrate DECIMAL(5, 2),
    max_heartrate INTEGER,
    average_watts DECIMAL(6, 2),
    max_watts INTEGER,
    average_cadence DECIMAL(5, 2),
    kilojoules DECIMAL(10, 2),
    calories DECIMAL(10, 2),
    gear_id VARCHAR(50),
    device_name VARCHAR(200),
    has_heartrate BOOLEAN DEFAULT FALSE,
    has_kudoed BOOLEAN DEFAULT FALSE,
    achievement_count INTEGER DEFAULT 0,
    kudos_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    athlete_count INTEGER DEFAULT 1,
    photo_count INTEGER DEFAULT 0,
    trainer BOOLEAN DEFAULT FALSE,
    commute BOOLEAN DEFAULT FALSE,
    manual BOOLEAN DEFAULT FALSE,
    private BOOLEAN DEFAULT FALSE,
    flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT idx_start_date CHECK (start_date IS NOT NULL)
);

-- Tabelle: activity_streams (GPS-Tracks, Herzfrequenz, Leistung, Kadenz)
-- Stores detailed time-series data for activities
CREATE TABLE IF NOT EXISTS activity_streams (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT REFERENCES activities(strava_activity_id) ON DELETE CASCADE,
    stream_type VARCHAR(50) NOT NULL, -- 'latlng', 'heartrate', 'watts', 'cadence', 'altitude', 'time', 'distance', 'velocity_smooth'
    data JSONB NOT NULL, -- Array of values
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(activity_id, stream_type)
);

-- Tabelle: segments
-- Stores Strava segment definitions
CREATE TABLE IF NOT EXISTS segments (
    id BIGINT PRIMARY KEY, -- Strava segment ID
    name VARCHAR(500),
    activity_type VARCHAR(50), -- 'Ride', 'Run'
    distance DECIMAL(10, 2), -- meters
    average_grade DECIMAL(6, 2),
    maximum_grade DECIMAL(6, 2),
    elevation_high DECIMAL(6, 2),
    elevation_low DECIMAL(6, 2),
    start_latlng JSONB, -- [lat, lng]
    end_latlng JSONB, -- [lat, lng]
    climb_category INTEGER,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle: segment_efforts
-- Stores segment efforts for activities
CREATE TABLE IF NOT EXISTS segment_efforts (
    id BIGSERIAL PRIMARY KEY,
    effort_id BIGINT UNIQUE NOT NULL, -- Strava segment effort ID
    segment_id BIGINT REFERENCES segments(id) ON DELETE CASCADE,
    activity_id BIGINT REFERENCES activities(strava_activity_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES user_profile(id) ON DELETE SET NULL,
    name VARCHAR(500),
    start_date TIMESTAMP,
    start_date_local TIMESTAMP,
    elapsed_time INTEGER, -- seconds
    moving_time INTEGER, -- seconds
    distance DECIMAL(10, 2), -- meters
    average_watts DECIMAL(6, 2),
    average_heartrate DECIMAL(6, 2),
    pr_rank INTEGER,
    kom_rank INTEGER,
    rank INTEGER,
    start_index INTEGER,
    end_index INTEGER,
    device_watts BOOLEAN,
    hidden BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle: athlete_stats
-- Stores aggregated statistics over time
CREATE TABLE IF NOT EXISTS athlete_stats (
    id SERIAL PRIMARY KEY,
    recorded_at DATE DEFAULT CURRENT_DATE,
    -- Recent totals (last 4 weeks)
    recent_ride_totals_count INTEGER DEFAULT 0,
    recent_ride_totals_distance DECIMAL(10, 2) DEFAULT 0,
    recent_ride_totals_time INTEGER DEFAULT 0,
    recent_ride_totals_elevation DECIMAL(10, 2) DEFAULT 0,
    recent_run_totals_count INTEGER DEFAULT 0,
    recent_run_totals_distance DECIMAL(10, 2) DEFAULT 0,
    recent_run_totals_time INTEGER DEFAULT 0,
    recent_run_totals_elevation DECIMAL(10, 2) DEFAULT 0,
    recent_swim_totals_count INTEGER DEFAULT 0,
    recent_swim_totals_distance DECIMAL(10, 2) DEFAULT 0,
    recent_swim_totals_time INTEGER DEFAULT 0,
    -- Year-to-date totals
    ytd_ride_totals_count INTEGER DEFAULT 0,
    ytd_ride_totals_distance DECIMAL(10, 2) DEFAULT 0,
    ytd_ride_totals_time INTEGER DEFAULT 0,
    ytd_ride_totals_elevation DECIMAL(10, 2) DEFAULT 0,
    ytd_run_totals_count INTEGER DEFAULT 0,
    ytd_run_totals_distance DECIMAL(10, 2) DEFAULT 0,
    ytd_run_totals_time INTEGER DEFAULT 0,
    ytd_run_totals_elevation DECIMAL(10, 2) DEFAULT 0,
    ytd_swim_totals_count INTEGER DEFAULT 0,
    ytd_swim_totals_distance DECIMAL(10, 2) DEFAULT 0,
    ytd_swim_totals_time INTEGER DEFAULT 0,
    -- All-time totals
    all_ride_totals_count INTEGER DEFAULT 0,
    all_ride_totals_distance DECIMAL(10, 2) DEFAULT 0,
    all_ride_totals_time INTEGER DEFAULT 0,
    all_ride_totals_elevation DECIMAL(10, 2) DEFAULT 0,
    all_run_totals_count INTEGER DEFAULT 0,
    all_run_totals_distance DECIMAL(10, 2) DEFAULT 0,
    all_run_totals_time INTEGER DEFAULT 0,
    all_run_totals_elevation DECIMAL(10, 2) DEFAULT 0,
    all_swim_totals_count INTEGER DEFAULT 0,
    all_swim_totals_distance DECIMAL(10, 2) DEFAULT 0,
    all_swim_totals_time INTEGER DEFAULT 0,
    UNIQUE(recorded_at)
);

-- Tabelle: gear (Bikes, Schuhe, etc.)
-- Stores information about equipment
CREATE TABLE IF NOT EXISTS gear (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200),
    brand_name VARCHAR(100),
    model_name VARCHAR(100),
    description TEXT,
    type VARCHAR(50), -- 'bike', 'shoes'
    distance DECIMAL(10, 2) DEFAULT 0, -- Total distance in meters
    retired BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelle: gear_maintenance
-- Tracks wear/maintenance per gear component
CREATE TABLE IF NOT EXISTS gear_maintenance (
    id SERIAL PRIMARY KEY,
    gear_id VARCHAR(50) REFERENCES gear(id) ON DELETE CASCADE,
    component_key VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    target_km DECIMAL(10, 2) DEFAULT 0,
    last_reset_km DECIMAL(10, 2) DEFAULT 0,
    last_reset_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gear_id, component_key)
);

-- Tabelle: sync_log
-- Tracks synchronization runs
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(50), -- 'running', 'completed', 'failed'
    items_processed INTEGER DEFAULT 0,
    error_message TEXT
);

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_sport_type ON activities(sport_type);
CREATE INDEX IF NOT EXISTS idx_activities_gear ON activities(gear_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_streams_activity_id ON activity_streams(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_streams_type ON activity_streams(stream_type);
CREATE INDEX IF NOT EXISTS idx_segments_activity_type ON segments(activity_type);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_segment_id ON segment_efforts(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_activity_id ON segment_efforts(activity_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_user_id ON segment_efforts(user_id);
CREATE INDEX IF NOT EXISTS idx_athlete_stats_recorded_at ON athlete_stats(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gear_maintenance_gear_id ON gear_maintenance(gear_id);

-- Views für häufige Queries

-- View: recent_activities
-- Shows the 50 most recent activities
CREATE OR REPLACE VIEW recent_activities AS
SELECT
    a.*,
    g.name as gear_name
FROM activities a
LEFT JOIN gear g ON a.gear_id = g.id
ORDER BY start_date DESC
LIMIT 50;

-- View: activity_summary_by_type
-- Aggregated statistics by activity type
CREATE OR REPLACE VIEW activity_summary_by_type AS
SELECT
    type,
    COUNT(*) as activity_count,
    ROUND(SUM(distance) / 1000, 2) as total_distance_km,
    ROUND(SUM(moving_time) / 3600.0, 2) as total_hours,
    ROUND(SUM(total_elevation_gain), 2) as total_elevation_m,
    ROUND(AVG(average_speed) * 3.6, 2) as avg_speed_kmh,
    ROUND(AVG(average_heartrate), 2) as avg_heartrate,
    ROUND(AVG(average_watts), 2) as avg_watts
FROM activities
GROUP BY type
ORDER BY activity_count DESC;

-- View: activity_summary_by_month
-- Monthly aggregated statistics
CREATE OR REPLACE VIEW activity_summary_by_month AS
SELECT
    DATE_TRUNC('month', start_date) as month,
    type,
    COUNT(*) as activity_count,
    ROUND(SUM(distance) / 1000, 2) as total_distance_km,
    ROUND(SUM(moving_time) / 3600.0, 2) as total_hours,
    ROUND(SUM(total_elevation_gain), 2) as total_elevation_m
FROM activities
GROUP BY DATE_TRUNC('month', start_date), type
ORDER BY month DESC, type;

-- View: gear_usage
-- Statistics per gear (bike/shoes)
CREATE OR REPLACE VIEW gear_usage AS
SELECT
    g.id,
    g.name,
    g.type,
    g.brand_name,
    g.model_name,
    COUNT(a.id) as activity_count,
    ROUND(SUM(a.distance) / 1000, 2) as total_distance_km,
    ROUND(SUM(a.moving_time) / 3600.0, 2) as total_hours,
    ROUND(g.distance / 1000, 2) as gear_total_distance_km,
    g.retired
FROM gear g
LEFT JOIN activities a ON g.id = a.gear_id
GROUP BY g.id, g.name, g.type, g.brand_name, g.model_name, g.distance, g.retired
ORDER BY total_distance_km DESC NULLS LAST;

-- View: personal_records
-- Top performances by type
CREATE OR REPLACE VIEW personal_records AS
WITH ranked_activities AS (
    SELECT
        type,
        name,
        start_date,
        distance,
        moving_time,
        total_elevation_gain,
        average_speed,
        max_speed,
        ROW_NUMBER() OVER (PARTITION BY type ORDER BY distance DESC) as rank_distance,
        ROW_NUMBER() OVER (PARTITION BY type ORDER BY average_speed DESC) as rank_speed,
        ROW_NUMBER() OVER (PARTITION BY type ORDER BY total_elevation_gain DESC) as rank_elevation
    FROM activities
    WHERE distance > 0
)
SELECT *
FROM ranked_activities
WHERE rank_distance <= 10 OR rank_speed <= 10 OR rank_elevation <= 10
ORDER BY type, rank_distance;

-- View: user_profile_complete
-- Complete user profile with settings and per-user stats
CREATE OR REPLACE VIEW user_profile_complete AS
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
    (SELECT COUNT(*) FROM strava.activities WHERE user_id = up.id) as total_activities,
    (SELECT COALESCE(SUM(CAST(distance AS NUMERIC) / 1000), 0) FROM strava.activities WHERE user_id = up.id) as total_distance_km,
    (SELECT COUNT(*) FROM strava.activities WHERE user_id = up.id AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)) as activities_this_year
FROM strava.user_profile up;

-- Tabelle: activity_photos
-- Stores photos associated with activities
CREATE TABLE IF NOT EXISTS activity_photos (
    id BIGSERIAL PRIMARY KEY,
    activity_id BIGINT REFERENCES activities(strava_activity_id) ON DELETE CASCADE,
    unique_id VARCHAR(100) UNIQUE NOT NULL,
    caption TEXT,
    source INTEGER DEFAULT 1, -- 1 = Strava, 2 = Instagram
    url_small VARCHAR(500),
    url_medium VARCHAR(500),
    url_large VARCHAR(500),
    local_path VARCHAR(500), -- Local file path for downloaded photos
    is_primary BOOLEAN DEFAULT FALSE,
    location JSONB, -- [lat, lng]
    uploaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_photos_activity_id ON activity_photos(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_photos_is_primary ON activity_photos(is_primary);

-- Tabelle: power_curve_cache
-- Pre-calculated power curve data for fast loading
CREATE TABLE IF NOT EXISTS power_curve_cache (
    id SERIAL PRIMARY KEY,
    year INTEGER, -- NULL means all-time
    activity_type VARCHAR(50), -- NULL means all types
    duration_seconds INTEGER NOT NULL,
    duration_label VARCHAR(20) NOT NULL,
    best_watts INTEGER NOT NULL,
    activity_id BIGINT REFERENCES activities(strava_activity_id) ON DELETE SET NULL,
    activities_analyzed INTEGER DEFAULT 0,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, activity_type, duration_seconds)
);

CREATE INDEX IF NOT EXISTS idx_power_curve_cache_lookup ON power_curve_cache(year, activity_type);
