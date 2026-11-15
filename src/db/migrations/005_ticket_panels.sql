CREATE TABLE ticket_panels (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  panel_channel_id TEXT NOT NULL,
  category_id TEXT,
  support_role_id TEXT,
  panel_title TEXT NOT NULL DEFAULT 'Centro de soporte',
  panel_description TEXT NOT NULL DEFAULT 'Pulsa el botón para abrir un ticket.',
  button_label TEXT NOT NULL DEFAULT 'Crear ticket',
  button_emoji TEXT,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  welcome_title TEXT NOT NULL DEFAULT 'Ticket abierto',
  welcome_message TEXT NOT NULL DEFAULT 'Hola {user}, describe tu consulta y el equipo te atenderá pronto.',
  close_message TEXT NOT NULL DEFAULT 'Este ticket fue cerrado por {user}.',
  form_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_panels_guild_idx ON ticket_panels(guild_id, created_at);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS panel_id BIGINT REFERENCES ticket_panels(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS form_data JSONB NOT NULL DEFAULT '{}'::jsonb;
