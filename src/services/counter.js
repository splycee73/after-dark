import { query, withTx } from '../db/pool.js';

export async function attempt(g, u, n, cfg) {
  return withTx(async (c) => {
    await c.query('INSERT INTO counter_state (guild_id, current) VALUES ($1,$2) ON CONFLICT DO NOTHING', [g, cfg.startNumber - 1]);
    const { rows: [s] } = await c.query('SELECT * FROM counter_state WHERE guild_id=$1 FOR UPDATE', [g]);
    const expected = Number(s.current) + 1;
    const reason = !cfg.allowSameUser && s.last_user_id === u ? 'misma persona dos veces' : n !== expected ? 'número incorrecto' : null;
    if (!reason) {
      await c.query(`UPDATE counter_state SET current=$2::bigint, last_user_id=$3, high_score=GREATEST(high_score,$2::bigint),
        total_ok=total_ok+1, updated_at=now() WHERE guild_id=$1`, [g, n, u]);
      return { ok: true };
    }
    await c.query(`UPDATE counter_state SET current = CASE WHEN $2::boolean THEN $3::bigint ELSE current END,
      last_user_id = CASE WHEN $2::boolean THEN NULL ELSE last_user_id END, total_fail=total_fail+1, updated_at=now() WHERE guild_id=$1`,
    [g, cfg.resetOnError, cfg.startNumber - 1]);
    return { ok: false, reason, expected, start: cfg.startNumber };
  });
}

export async function getCounter(g) {
  const { rows: [s] } = await query('SELECT * FROM counter_state WHERE guild_id=$1', [g]);
  return s ? { current: Number(s.current), lastUserId: s.last_user_id, highScore: Number(s.high_score), totalOk: Number(s.total_ok), totalFail: Number(s.total_fail) }
    : { current: null, lastUserId: null, highScore: 0, totalOk: 0, totalFail: 0 };
}

// `next` = número que se espera a continuación.
export const setCounter = (g, next) => query(
  `INSERT INTO counter_state (guild_id, current) VALUES ($1,$2)
   ON CONFLICT (guild_id) DO UPDATE SET current=$2, last_user_id=NULL, updated_at=now()`, [g, next - 1]);
