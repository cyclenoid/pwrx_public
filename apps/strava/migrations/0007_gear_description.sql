-- Ensure legacy databases have gear.description for manual gear metadata.
ALTER TABLE gear
ADD COLUMN IF NOT EXISTS description TEXT;
