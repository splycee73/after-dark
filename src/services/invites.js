import { query } from '../db/pool.js';
import { getModuleState } from './guilds.js';
import { entity } from './entity.js';
import { logger } from '../lib/logger.js';

const cache = new Map(); // guildId -> Map(code -> { uses, inviterId })

export const rewards = entity({
  table: 'invite_rewards', order: 'invites_required', max: 20,
  fields: [
    { key: 'invitesRequired', col: 'invites_required', type: 'int', min: 1, max: 100000, req: true, label: 'Invitaciones necesarias' },
    { key: 'roleId', col: 'role_id', type: 'role', req: true, label: 'Rol' },
  ],
});

export async function prime(guild) {
  try {
    const invs = await guild.invites.fetch();
    cache.set(guild.id, new Map(invs.map((i) => [i.code, { uses: i.uses ?? 0, inviterId: i.inviter?.id ?? null }])));
  } catch (e) { logger.warn(`Invites: sin permiso en ${guild.name} (${e.message})`); }
}
export const onInviteCreate = (inv) => cache.get(inv.guild.id)?.set(inv.code, { uses: inv.uses ?? 0, inviterId: inv.inviter?.id ?? null });
export const onInviteDelete = (inv) => cache.get(inv.guild.id)?.delete(inv.code);

// Detecta qué invitación usó el miembro comparando contadores. Nunca lanza.
export async function trackJoin(member) {
  try {
    const { enabled, config } = await getModuleState(member.guild.id, 'invites');
    if (!enabled) return { inviterId: null, code: null };
    const before = cache.get(member.guild.id) ?? new Map();
    const invs = await member.guild.invites.fetch();
    let used = invs.find((i) => (i.uses ?? 0) > (before.get(i.code)?.uses ?? 0));
    if (!used) used = [...before.keys()].filter((c) => !invs.has(c)).map((c) => ({ code: c, inviter: { id: before.get(c).inviterId } }))[0]; // invitación de un solo uso ya borrada
    cache.set(member.guild.id, new Map(invs.map((i) => [i.code, { uses: i.uses ?? 0, inviterId: i.inviter?.id ?? null }])));
    const inviterId = used?.inviter?.id ?? null;
    const code = used?.code ?? (member.guild.vanityURLCode ? 'vanity' : null);
    const ageDays = (Date.now() - member.user.createdTimestamp) / 86400000;
    const fake = inviterId === member.id || (config.fakeAccountDays > 0 && ageDays < config.fakeAccountDays);
    await query('INSERT INTO invite_joins (guild_id, member_id, inviter_id, code, fake) VALUES ($1,$2,$3,$4,$5)', [member.guild.id, member.id, inviterId, code, fake]);
    return { inviterId, code };
  } catch (e) {
    logger.warn('Invites trackJoin:', e.message);
    return { inviterId: null, code: null };
  }
}
export const markLeft = (g, u) => query(
  'UPDATE invite_joins SET left_at=now() WHERE id = (SELECT id FROM invite_joins WHERE guild_id=$1 AND member_id=$2 AND left_at IS NULL ORDER BY id DESC LIMIT 1)', [g, u]);

export async function stats(g, inviterId) {
  const { rows: [r] } = await query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE left_at IS NOT NULL)::int AS left,
            COUNT(*) FILTER (WHERE fake)::int AS fake,
            COUNT(*) FILTER (WHERE left_at IS NULL AND NOT fake)::int AS valid
     FROM invite_joins WHERE guild_id=$1 AND inviter_id=$2`, [g, inviterId]);
  return r;
}
export async function top(g, limit = 10) {
  const { rows } = await query(
    `SELECT inviter_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE left_at IS NOT NULL)::int AS left,
            COUNT(*) FILTER (WHERE fake)::int AS fake, COUNT(*) FILTER (WHERE left_at IS NULL AND NOT fake)::int AS valid
     FROM invite_joins WHERE guild_id=$1 AND inviter_id IS NOT NULL GROUP BY inviter_id ORDER BY valid DESC, total DESC LIMIT $2`, [g, limit]);
  return rows.map((r) => ({ inviterId: r.inviter_id, total: r.total, left: r.left, fake: r.fake, valid: r.valid }));
}
export async function recent(g, limit = 25) {
  const { rows } = await query('SELECT member_id, inviter_id, code, fake, joined_at, left_at FROM invite_joins WHERE guild_id=$1 ORDER BY id DESC LIMIT $2', [g, limit]);
  return rows.map((r) => ({ memberId: r.member_id, inviterId: r.inviter_id, code: r.code, fake: r.fake, joinedAt: r.joined_at, leftAt: r.left_at }));
}

export async function checkRewards(guild, inviterId) {
  if (!inviterId) return;
  const { valid } = await stats(guild.id, inviterId);
  const member = await guild.members.fetch(inviterId).catch(() => null);
  if (!member) return;
  for (const r of await rewards.list(guild.id)) {
    if (valid >= r.invitesRequired && !member.roles.cache.has(r.roleId)) await member.roles.add(r.roleId, `Recompensa por ${r.invitesRequired} invitaciones`).catch(() => {});
  }
}
