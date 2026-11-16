import { query, withTx } from '../db/pool.js';

export class EconomyError extends Error {}

// Bloquea (y crea si falta) las cuentas en orden fijo para evitar deadlocks.
export async function lock(c, g, ids, start = 0) {
  const sorted = [...new Set(ids)].sort();
  for (const u of sorted) {
    await c.query('INSERT INTO economy_accounts (guild_id, user_id, balance) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [g, u, start]);
  }
  const { rows } = await c.query(
    'SELECT user_id, balance FROM economy_accounts WHERE guild_id=$1 AND user_id = ANY($2::text[]) ORDER BY user_id FOR UPDATE', [g, sorted]);
  return Object.fromEntries(rows.map((r) => [r.user_id, Number(r.balance)]));
}
export const setBal = (c, g, u, delta) => c.query(
  `UPDATE economy_accounts SET balance = balance + $3, total_earned = total_earned + GREATEST($3,0), updated_at = now()
   WHERE guild_id=$1 AND user_id=$2`, [g, u, delta]);
export const log = (c, g, u, type, amount, counterpart = null, note = null) => c.query(
  'INSERT INTO economy_transactions (guild_id,user_id,type,amount,counterpart_id,note) VALUES ($1,$2,$3,$4,$5,$6)',
  [g, u, type, amount, counterpart, note]);

export const getBalance = (g, u, start = 0) => withTx(async (c) => (await lock(c, g, [u], start))[u]);

export function credit(g, u, delta, type, { note = null, start = 0 } = {}) {
  return withTx(async (c) => {
    const bal = (await lock(c, g, [u], start))[u];
    if (bal + delta < 0) throw new EconomyError('Saldo insuficiente.');
    await setBal(c, g, u, delta);
    await log(c, g, u, type, delta, null, note);
    return bal + delta;
  });
}

// Reclama un cooldown de forma atómica. Devuelve { ok } o { ok:false, remaining } en segundos.
export async function claimCooldown(g, u, action, seconds) {
  if (seconds <= 0) return { ok: true };
  const { rowCount } = await query(
    `INSERT INTO economy_cooldowns (guild_id,user_id,action,available_at)
     VALUES ($1,$2,$3, now() + make_interval(secs => $4::double precision))
     ON CONFLICT (guild_id,user_id,action) DO UPDATE SET available_at = EXCLUDED.available_at
     WHERE economy_cooldowns.available_at <= now()`, [g, u, action, seconds]);
  if (rowCount) return { ok: true };
  const { rows: [r] } = await query(
    `SELECT CEIL(EXTRACT(EPOCH FROM available_at - now()))::int AS s FROM economy_cooldowns WHERE guild_id=$1 AND user_id=$2 AND action=$3`, [g, u, action]);
  return { ok: false, remaining: Math.max(1, r?.s ?? 1) };
}

export function transfer(g, from, to, amount, start = 0) {
  return withTx(async (c) => {
    const bal = await lock(c, g, [from, to], start);
    if (bal[from] < amount) throw new EconomyError('No tienes saldo suficiente.');
    await setBal(c, g, from, -amount);
    await setBal(c, g, to, amount);
    await log(c, g, from, 'pay_sent', -amount, to);
    await log(c, g, to, 'pay_received', amount, from);
    return { from: bal[from] - amount, to: bal[to] + amount };
  });
}

export function rob(g, robber, victim, cfg) {
  return withTx(async (c) => {
    const bal = await lock(c, g, [robber, victim], cfg.startBalance);
    if (bal[victim] < Math.max(1, cfg.robMinVictim)) throw new EconomyError('Esa persona tiene muy poco dinero para robarle.');
    const move = async (from, to, amt, tin, tout) => {
      await setBal(c, g, from, -amt); await setBal(c, g, to, amt);
      await log(c, g, from, tout, -amt, to); await log(c, g, to, tin, amt, from);
    };
    if (Math.random() * 100 < cfg.robChance) {
      const hi = cfg.robMaxPercent, lo = Math.min(10, hi);
      const pct = lo + Math.random() * (hi - lo);
      const amount = Math.max(1, Math.floor((bal[victim] * pct) / 100));
      await move(victim, robber, amount, 'rob_win', 'rob_victim');
      return { success: true, amount };
    }
    const fine = Math.floor((bal[robber] * cfg.robFinePercent) / 100);
    if (fine > 0) await move(robber, victim, fine, 'rob_fine_received', 'rob_fine');
    return { success: false, amount: fine };
  });
}

export async function leaderboard(g, limit = 10) {
  const { rows } = await query('SELECT user_id, balance FROM economy_accounts WHERE guild_id=$1 AND balance > 0 ORDER BY balance DESC LIMIT $2', [g, limit]);
  return rows.map((r) => ({ userId: r.user_id, balance: Number(r.balance) }));
}

export async function history(g, u, limit = 10) {
  const { rows } = await query('SELECT type, amount, counterpart_id, note, created_at FROM economy_transactions WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT $3', [g, u, limit]);
  return rows.map((r) => ({ type: r.type, amount: Number(r.amount), counterpartId: r.counterpart_id, note: r.note, at: r.created_at }));
}

export async function recentTransactions(g, limit = 25) {
  const { rows } = await query('SELECT user_id, type, amount, counterpart_id, note, created_at FROM economy_transactions WHERE guild_id=$1 ORDER BY id DESC LIMIT $2', [g, limit]);
  return rows.map((r) => ({ userId: r.user_id, type: r.type, amount: Number(r.amount), counterpartId: r.counterpart_id, note: r.note, at: r.created_at }));
}
