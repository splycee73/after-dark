ALTER TABLE ticket_panels
  ADD COLUMN IF NOT EXISTS panel_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS readonly_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS panel_image_url TEXT,
  ADD COLUMN IF NOT EXISTS panel_footer TEXT;

