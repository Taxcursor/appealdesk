-- Add contacts JSONB column to proceedings
-- Each element: { id, designation, name, mobile, email }
ALTER TABLE proceedings ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]' NOT NULL;
