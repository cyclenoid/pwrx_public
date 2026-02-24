-- Add gear maintenance tracking
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

CREATE INDEX IF NOT EXISTS idx_gear_maintenance_gear_id ON gear_maintenance(gear_id);
