import { query, withTx } from '../db/pool.js';

export async function addCase(g, userId, modId, action, reason = '', durationSeconds = null) {
  return withTx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`case:${g}`]);
    return (await c.query(
      `INSERT INTO mod_cases (guild_id, number, user_id, moderator_id, action, reason, duration_seconds)
       VALUES ($1, (SELECT COALESCE(MAX(number),0)+1 FROM mod_cases WHERE guild_id=$1), $2,$3,$4,$5,$6) RETURNING *`,
      [g, userId, modId, action, reason.slice(0, 500), durationSeconds])).rows[0];
  });
}
export const warnCount = async (g, u) =>
  (await query("SELECT COUNT(*)::int AS n FROM mod_cases WHERE guild_id=$1 AND user_id=$2 AND action='warn'", [g, u])).rows[0].n;
export const clearWarns = (g, u) => query("DELETE FROM mod_cases WHERE guild_id=$1 AND user_id=$2 AND action='warn'", [g, u]);

export async function listCases(g, { userId = null, limit = 25 } = {}) {
  const { rows } = await query(
    `SELECT number, user_id, moderator_id, action, reason, duration_seconds, created_at FROM mod_cases
     WHERE guild_id=$1 AND ($2::text IS NULL OR user_id=$2) ORDER BY id DESC LIMIT $3`, [g, userId, limit]);
  return rows.map((r) => ({ number: r.number, userId: r.user_id, moderatorId: r.moderator_id, action: r.action, reason: r.reason, durationSeconds: r.duration_seconds, at: r.created_at }));
}

const UNIT = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
export function parseDuration(text) {
  const m = String(text ?? '').trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  return m ? Number(m[1]) * UNIT[m[2]] : null; // segundos
}
