CREATE TABLE moderation_warnings (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Sin motivo especificado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX moderation_warnings_lookup_idx ON moderation_warnings (guild_id, user_id, created_at DESC);
