import { query } from '../db/pool.js';
import { getModuleState } from './guilds.js';

export async function addEntry(guild, userId, by, note = '') {
  await query(
    `INSERT INTO whitelist_entries (guild_id, user_id, note, added_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET note=$3, added_by=$4`, [guild.id, userId, note.slice(0, 100), by]);
  const { config } = await getModuleState(guild.id, 'whitelist');
  if (config.whitelistRoleId) {
    const m = await guild.members.fetch(userId).catch(() => null);
    await m?.roles.add(config.whitelistRoleId, 'Whitelist').catch(() => {});
  }
}
export async function removeEntry(guild, userId) {
  const { rowCount } = await query('DELETE FROM whitelist_entries WHERE guild_id=$1 AND user_id=$2', [guild.id, userId]);
  const { config } = await getModuleState(guild.id, 'whitelist');
  if (config.whitelistRoleId) {
    const m = await guild.members.fetch(userId).catch(() => null);
    await m?.roles.remove(config.whitelistRoleId, 'Quitado de la whitelist').catch(() => {});
  }
  return rowCount > 0;
}
export const isWhitelisted = async (g, u) =>
  (await query('SELECT 1 FROM whitelist_entries WHERE guild_id=$1 AND user_id=$2', [g, u])).rowCount > 0;
export async function listEntries(g, limit = 200) {
  const { rows } = await query('SELECT user_id, note, added_by, created_at FROM whitelist_entries WHERE guild_id=$1 ORDER BY created_at DESC LIMIT $2', [g, limit]);
  return rows.map((r) => ({ userId: r.user_id, note: r.note, addedBy: r.added_by, at: r.created_at }));
}
