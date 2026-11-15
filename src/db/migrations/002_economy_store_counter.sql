CREATE TABLE economy_accounts (
  guild_id     TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  balance      BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX economy_accounts_rank_idx ON economy_accounts (guild_id, balance DESC);

CREATE TABLE economy_cooldowns (
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  action       TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (guild_id, user_id, action)
);

CREATE TABLE economy_transactions (
  id             BIGSERIAL PRIMARY KEY,
  guild_id       TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  type           TEXT NOT NULL,
  amount         BIGINT NOT NULL,
  counterpart_id TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX economy_tx_user_idx  ON economy_transactions (guild_id, user_id, created_at DESC);
CREATE INDEX economy_tx_guild_idx ON economy_transactions (guild_id, created_at DESC);

CREATE TABLE store_items (
  id                BIGSERIAL PRIMARY KEY,
  guild_id          TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  price             BIGINT NOT NULL CHECK (price >= 0),
  stock             INT CHECK (stock >= 0),            -- NULL = ilimitado
  type              TEXT NOT NULL CHECK (type IN ('role','nickname','item')),
  role_id           TEXT,
  duration_seconds  INT,                                -- NULL = permanente
  required_role_id  TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX store_items_guild_idx ON store_items (guild_id);

CREATE TABLE user_inventory (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  item_id  BIGINT NOT NULL REFERENCES store_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (guild_id, user_id, item_id)
);

CREATE TABLE temp_roles (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role_id    TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (guild_id, user_id, role_id)
);
CREATE INDEX temp_roles_exp_idx ON temp_roles (expires_at);

CREATE TABLE counter_state (
  guild_id     TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  current      BIGINT NOT NULL DEFAULT 0,   -- último número válido
  last_user_id TEXT,
  high_score   BIGINT NOT NULL DEFAULT 0,
  total_ok     BIGINT NOT NULL DEFAULT 0,
  total_fail   BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
