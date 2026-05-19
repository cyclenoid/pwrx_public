-- Manual exercise log for reps/time based training outside GPS activities.

CREATE TABLE IF NOT EXISTS exercise_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  default_unit TEXT NOT NULL DEFAULT 'reps'
    CHECK (default_unit IN ('reps', 'seconds')),
  category TEXT NOT NULL DEFAULT 'custom',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_types_name_active
  ON exercise_types (LOWER(name))
  WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_exercise_types_category
  ON exercise_types (category);

CREATE TABLE IF NOT EXISTS exercise_entries (
  id BIGSERIAL PRIMARY KEY,
  exercise_type_id INTEGER NOT NULL REFERENCES exercise_types(id) ON DELETE RESTRICT,
  performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  value NUMERIC(12, 2) NOT NULL CHECK (value > 0),
  unit TEXT NOT NULL CHECK (unit IN ('reps', 'seconds')),
  notes TEXT,
  activity_id BIGINT REFERENCES activities(strava_activity_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exercise_entries_type_performed
  ON exercise_entries (exercise_type_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_entries_performed
  ON exercise_entries (performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_entries_activity
  ON exercise_entries (activity_id)
  WHERE activity_id IS NOT NULL;
