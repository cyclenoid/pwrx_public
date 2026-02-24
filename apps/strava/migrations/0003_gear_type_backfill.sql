-- Backfill gear.type based on Strava gear id prefix
UPDATE strava.gear
SET type = CASE
  WHEN LOWER(id) LIKE 'b%' THEN 'bike'
  WHEN LOWER(id) LIKE 'g%' THEN 'shoes'
  ELSE type
END
WHERE type IS NULL OR TRIM(type) = '';
