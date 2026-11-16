CREATE TABLE ticket_categories (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  parent_id TEXT, support_role_ids TEXT[] NOT NULL DEFAULT '{}', welcome_message TEXT NOT NULL DEFAULT '',
  questions JSONB NOT NULL DEFAULT '[]', enabled BOOLEAN NOT NULL DEFAULT true, position INT NOT NULL DEFAULT 0
);
CREATE INDEX ticket_categories_guild_idx ON ticket_categories (guild_id);

CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  number INT NOT NULL, category_id BIGINT REFERENCES ticket_categories(id) ON DELETE SET NULL,
  channel_id TEXT NOT NULL DEFAULT '', owner_id TEXT NOT NULL, claimed_by TEXT,
  status TEXT NOT NULL DEFAULT 'open', answers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ, closed_by TEXT, close_reason TEXT,
  rating SMALLINT, transcript TEXT, UNIQUE (guild_id, number)
);
CREATE INDEX tickets_channel_idx ON tickets (channel_id);
CREATE INDEX tickets_owner_idx ON tickets (guild_id, owner_id, status);

CREATE TABLE mod_cases (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  number INT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '', duration_seconds INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, number)
);
CREATE INDEX mod_cases_user_idx ON mod_cases (guild_id, user_id);

CREATE TABLE whitelist_entries (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', added_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE invite_joins (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL, inviter_id TEXT, code TEXT, fake BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), left_at TIMESTAMPTZ
);
CREATE INDEX invite_joins_inviter_idx ON invite_joins (guild_id, inviter_id);
CREATE INDEX invite_joins_member_idx ON invite_joins (guild_id, member_id);
CREATE INDEX invite_joins_time_idx ON invite_joins (guild_id, joined_at DESC);

CREATE TABLE invite_rewards (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  invites_required INT NOT NULL, role_id TEXT NOT NULL
);

CREATE TABLE suggestions (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  number INT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, channel_id TEXT, message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ, UNIQUE (guild_id, number)
);
CREATE INDEX suggestions_msg_idx ON suggestions (message_id);
CREATE TABLE suggestion_votes (
  suggestion_id BIGINT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
  vote SMALLINT NOT NULL, PRIMARY KEY (suggestion_id, user_id)
);

CREATE TABLE role_panels (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL, channel_id TEXT, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#8b5cf6', exclusive BOOLEAN NOT NULL DEFAULT false,
  role_ids TEXT[] NOT NULL DEFAULT '{}', message_id TEXT
);

CREATE TABLE embed_templates (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_usage (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id, day)
);

CREATE TABLE module_runs (
  guild_id TEXT NOT NULL, module TEXT NOT NULL, last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, module)
);
CREATE TABLE posted_items (
  guild_id TEXT NOT NULL, module TEXT NOT NULL, item_key TEXT NOT NULL, posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, module, item_key)
);
