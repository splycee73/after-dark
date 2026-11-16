-- Ticket panels independientes, jerarquía de categorías y permisos por panel.
CREATE TABLE ticket_panels (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_id TEXT,
  title TEXT NOT NULL DEFAULT '🎫 Centro de soporte',
  description TEXT NOT NULL DEFAULT 'Selecciona una opción para abrir un ticket.',
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  support_role_ids TEXT[] NOT NULL DEFAULT '{}',
  welcome_message TEXT NOT NULL DEFAULT 'Hola {user}, el equipo te atenderá pronto.',
  close_message TEXT NOT NULL DEFAULT 'Este ticket fue cerrado por {closer}. Motivo: {reason}',
  claim_enabled BOOLEAN NOT NULL DEFAULT true,
  owner_can_close BOOLEAN NOT NULL DEFAULT false,
  components JSONB NOT NULL DEFAULT '[]',
  message_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_panels_guild_idx ON ticket_panels (guild_id, id);

ALTER TABLE ticket_categories
  ADD COLUMN panel_id BIGINT REFERENCES ticket_panels(id) ON DELETE CASCADE,
  ADD COLUMN parent_category_id BIGINT REFERENCES ticket_categories(id) ON DELETE CASCADE,
  ADD COLUMN button_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN button_style TEXT NOT NULL DEFAULT 'Primary',
  ADD COLUMN position INT NOT NULL DEFAULT 0;

ALTER TABLE tickets
  ADD COLUMN panel_id BIGINT REFERENCES ticket_panels(id) ON DELETE SET NULL,
  ADD COLUMN claimed_at TIMESTAMPTZ;

-- Migrar la configuración antigua a un panel por servidor para no perder los paneles existentes.
INSERT INTO ticket_panels (guild_id, name, channel_id, title, description, color, support_role_ids,
  welcome_message, close_message, claim_enabled)
SELECT gm.guild_id, 'Panel principal', NULLIF(gm.config->>'panelChannelId',''),
  COALESCE(NULLIF(gm.config->>'panelTitle',''), '🎫 Centro de soporte'),
  COALESCE(NULLIF(gm.config->>'panelDescription',''), 'Selecciona una opción para abrir un ticket.'),
  COALESCE(NULLIF(gm.config->>'panelColor',''), '#8b5cf6'),
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(gm.config->'supportRoleIds','[]'::jsonb))), '{}'),
  COALESCE(NULLIF(gm.config->>'welcomeMessage',''), 'Hola {user}, el equipo te atenderá pronto.'),
  COALESCE(NULLIF(gm.config->>'closeMessage',''), 'Este ticket fue cerrado por {closer}. Motivo: {reason}'),
  COALESCE((gm.config->>'claimEnabled')::boolean, true)
FROM guild_modules gm
WHERE gm.module='tickets'
  AND EXISTS (SELECT 1 FROM ticket_categories tc WHERE tc.guild_id=gm.guild_id)
ON CONFLICT DO NOTHING;

UPDATE ticket_categories tc SET panel_id = (
  SELECT tp.id FROM ticket_panels tp WHERE tp.guild_id=tc.guild_id ORDER BY tp.id LIMIT 1
) WHERE tc.panel_id IS NULL;

UPDATE tickets t SET panel_id = tc.panel_id
FROM ticket_categories tc WHERE tc.id=t.category_id AND t.panel_id IS NULL;
