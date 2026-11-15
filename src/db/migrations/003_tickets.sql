CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL UNIQUE,
  opener_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT
);
CREATE INDEX tickets_guild_status_idx ON tickets (guild_id, status, created_at DESC);
