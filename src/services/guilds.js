import { query } from '../db/pool.js';
import { MODULES, MODULE_KEYS } from '../modules.js';
import { SCHEMAS, normalizeConfig } from './schemas.js';
import { emitLog } from '../lib/bus.js';

const cache = new Map(); // `${guildId}:${module}` -> { enabled, config, t }
const TTL = 30_000;

export async function upsertGuild(g) {
  await query(
    `INSERT INTO guilds (id, name, icon, owner_id, member_count) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET name=$2, icon=$3, owner_id=$4, member_count=$5, left_at=NULL`,
    [g.id, g.name, g.icon, g.ownerId, g.memberCount],
  );
  await query(
    `INSERT INTO guild_modules (guild_id, module) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
    [g.id, MODULE_KEYS],
  );
}

export const markGuildLeft = (id) => query('UPDATE guilds SET left_at = now() WHERE id = $1', [id]);

export async function getModules(guildId) {
  const { rows } = await query('SELECT module, enabled, config FROM guild_modules WHERE guild_id=$1', [guildId]);
  const byKey = Object.fromEntries(rows.map((r) => [r.module, r]));
  return MODULES.map((m) => ({ ...m, enabled: byKey[m.key]?.enabled ?? false,
    config: normalizeConfig(m.key, byKey[m.key]?.config), schema: SCHEMAS[m.key] ?? null }));
}

// Lo usa el bot en cada evento para saber si debe actuar.
export async function getModuleState(guildId, key) {
  const ck = `${guildId}:${key}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return hit;
  const { rows } = await query('SELECT enabled, config FROM guild_modules WHERE guild_id=$1 AND module=$2', [guildId, key]);
  const val = { enabled: rows[0]?.enabled ?? false, config: normalizeConfig(key, rows[0]?.config), t: Date.now() };
  cache.set(ck, val);
  return val;
}

export async function setModule(guildId, key, { enabled, config }, actorId) {
  await query(
    `UPDATE guild_modules SET enabled = COALESCE($3, enabled), config = COALESCE($4::jsonb, config),
     updated_at = now(), updated_by = $5 WHERE guild_id=$1 AND module=$2`,
    [guildId, key, enabled ?? null, config ? JSON.stringify(config) : null, actorId],
  );
  cache.delete(`${guildId}:${key}`); // el bot ve el cambio al instante
  await audit(guildId, actorId, 'module.update', { module: key, enabled, config });
}

export function audit(guildId, actorId, action, details = {}) {
  if (guildId) emitLog(guildId, 'config_change', { title: '⚙️ Configuración modificada', description: `<@${actorId}> · \`${action}\`` });
  return query('INSERT INTO audit_log (guild_id, actor_id, action, details) VALUES ($1,$2,$3,$4)', [guildId, actorId, action, details]);
}
