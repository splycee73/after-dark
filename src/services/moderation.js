import { query } from '../db/pool.js';

export async function addWarning(guildId, userId, moderatorId, reason) {
  const { rows: [row] } = await query(
    'INSERT INTO moderation_warnings (guild_id,user_id,moderator_id,reason) VALUES ($1,$2,$3,$4) RETURNING id,created_at',
    [guildId, userId, moderatorId, String(reason || 'Sin motivo especificado').slice(0, 500)],
  );
  return row;
}

export async function getWarnings(guildId, userId, limit = 20) {
  const { rows } = await query(
    'SELECT id, moderator_id AS "moderatorId", reason, created_at AS "createdAt" FROM moderation_warnings WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT $3',
    [guildId, userId, limit],
  );
  return rows;
}
