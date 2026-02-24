-- Migration 010: Add segments and segment_efforts tables

CREATE TABLE IF NOT EXISTS strava.segments (
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

CREATE TABLE IF NOT EXISTS strava.segment_efforts (
    id BIGSERIAL PRIMARY KEY,
    effort_id BIGINT UNIQUE NOT NULL, -- Strava segment effort ID
    segment_id BIGINT REFERENCES strava.segments(id) ON DELETE CASCADE,
    activity_id BIGINT REFERENCES strava.activities(strava_activity_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES strava.user_profile(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_segments_activity_type ON strava.segments(activity_type);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_segment_id ON strava.segment_efforts(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_activity_id ON strava.segment_efforts(activity_id);
CREATE INDEX IF NOT EXISTS idx_segment_efforts_user_id ON strava.segment_efforts(user_id);
