-- Servidores donde está el bot
CREATE TABLE guilds (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  icon         TEXT,
  owner_id     TEXT,
  member_count INT NOT NULL DEFAULT 0,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at      TIMESTAMPTZ
);

-- Estado y configuración de cada módulo por servidor
CREATE TABLE guild_modules (
  guild_id   TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  module     TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT false,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (guild_id, module)
);

-- Presencia global del bot (una sola fila)
CREATE TABLE bot_presence (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  interval_seconds INT NOT NULL DEFAULT 30,
  status           TEXT NOT NULL DEFAULT 'online',
  activities       JSONB NOT NULL
);
INSERT INTO bot_presence (activities) VALUES ('[
  {"type":"Watching","text":"{miembros} miembros"},
  {"type":"Watching","text":"AFTER DARK"},
  {"type":"Custom","text":"𖤐 AFTER ON TOP"},
  {"type":"Custom","text":"† AYUDANTE DE SAL DEIDAD"}
]'::jsonb);

-- Auditoría de cambios hechos desde el dashboard
CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  guild_id   TEXT,
  actor_id   TEXT NOT NULL,
  action     TEXT NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_guild_idx ON audit_log (guild_id, created_at DESC);
