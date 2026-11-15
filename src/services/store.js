import { query, withTx } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { EconomyError, lock, setBal, log, credit } from './economy.js';

const SNOWFLAKE = /^\d{17,20}$/;
const toItem = (r) => ({
  id: String(r.id), name: r.name, description: r.description, price: Number(r.price), stock: r.stock,
  type: r.type, roleId: r.role_id, durationSeconds: r.duration_seconds, requiredRoleId: r.required_role_id, enabled: r.enabled,
});

export async function listItems(g, { onlyEnabled = false } = {}) {
  const { rows } = await query(`SELECT * FROM store_items WHERE guild_id=$1 ${onlyEnabled ? 'AND enabled' : ''} ORDER BY price, id`, [g]);
  return rows.map(toItem);
}

export function cleanItem(i, guild) {
  const bad = (m) => { throw new EconomyError(m); };
  const name = String(i?.name ?? '').trim();
  if (!name || name.length > 64) bad('El nombre es obligatorio (máx. 64 caracteres).');
  const price = Number(i.price);
  if (!Number.isInteger(price) || price < 0 || price > 1e9) bad('Precio inválido.');
  const stock = i.stock === null || i.stock === '' || i.stock === undefined ? null : Number(i.stock);
  if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1e6)) bad('Stock inválido.');
  if (!['role', 'nickname', 'item'].includes(i.type)) bad('Tipo inválido.');
  const roleId = i.type === 'role' ? i.roleId : null;
  if (i.type === 'role' && !(SNOWFLAKE.test(roleId ?? '') && guild.roles.cache.has(roleId))) bad('Selecciona un rol válido.');
  const dur = i.type === 'role' && i.durationSeconds ? Number(i.durationSeconds) : null;
  if (dur !== null && (!Number.isInteger(dur) || dur < 60 || dur > 31_536_000)) bad('Duración inválida (mín. 1 minuto).');
  const req = i.requiredRoleId || null;
  if (req && !(SNOWFLAKE.test(req) && guild.roles.cache.has(req))) bad('Rol requerido inválido.');
  return { name, description: String(i.description ?? '').trim().slice(0, 200), price, stock, type: i.type, roleId, dur, req, enabled: i.enabled !== false };
}

export async function createItem(g, raw, guild) {
  const i = cleanItem(raw, guild);
  const { rows: [n] } = await query('SELECT COUNT(*)::int AS n FROM store_items WHERE guild_id=$1', [g]);
  if (n.n >= 100) throw new EconomyError('Máximo 100 artículos por servidor.');
  const { rows: [r] } = await query(
    `INSERT INTO store_items (guild_id,name,description,price,stock,type,role_id,duration_seconds,required_role_id,enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [g, i.name, i.description, i.price, i.stock, i.type, i.roleId, i.dur, i.req, i.enabled]);
  return toItem(r);
}

export async function updateItem(g, id, raw, guild) {
  const i = cleanItem(raw, guild);
  const { rows: [r] } = await query(
    `UPDATE store_items SET name=$3,description=$4,price=$5,stock=$6,type=$7,role_id=$8,duration_seconds=$9,required_role_id=$10,enabled=$11
     WHERE guild_id=$1 AND id=$2 RETURNING *`, [g, id, i.name, i.description, i.price, i.stock, i.type, i.roleId, i.dur, i.req, i.enabled]);
  if (!r) throw new EconomyError('Artículo no encontrado.');
  return toItem(r);
}

export const deleteItem = (g, id) => query('DELETE FROM store_items WHERE guild_id=$1 AND id=$2', [g, id]);

export async function buyItem({ guild, member, ref, nickname, start = 0 }) {
  const g = guild.id, u = member.id;
  const text = String(ref).trim();
  const { rows: [row] } = /^\d+$/.test(text)
    ? await query('SELECT * FROM store_items WHERE guild_id=$1 AND id=$2', [g, text])
    : await query(`SELECT * FROM store_items WHERE guild_id=$1 AND name ILIKE $2 ORDER BY (lower(name)=lower($3)) DESC LIMIT 1`,
      [g, `%${text.replace(/[\\%_]/g, '\\$&')}%`, text]);
  if (!row || !row.enabled) throw new EconomyError('No encontré ese artículo. Usa el ID que aparece en la tienda.');
  const item = toItem(row);
  if (item.requiredRoleId && !member.roles.cache.has(item.requiredRoleId)) throw new EconomyError('No cumples el rol requerido para este artículo.');

  const role = item.type === 'role' ? guild.roles.cache.get(item.roleId) : null;
  if (item.type === 'role') {
    if (!role || !role.editable) throw new EconomyError('El rol de este artículo no está disponible o el bot no puede asignarlo.');
    if (!item.durationSeconds && member.roles.cache.has(role.id)) throw new EconomyError('Ya tienes este rol.');
  }
  if (item.type === 'nickname') {
    if (!nickname || nickname.length > 32) throw new EconomyError('Indica el apodo que quieres (máx. 32 caracteres).');
    if (!member.manageable) throw new EconomyError('No puedo cambiar tu apodo (tu rol es superior al mío o eres el dueño).');
  }

  const balance = await withTx(async (c) => {
    const { rows: [it] } = await c.query('SELECT stock, enabled, price FROM store_items WHERE id=$1 AND guild_id=$2 FOR UPDATE', [item.id, g]);
    if (!it || !it.enabled) throw new EconomyError('Este artículo ya no está disponible.');
    if (it.stock !== null && it.stock <= 0) throw new EconomyError('Artículo agotado.');
    const price = Number(it.price);
    const bal = (await lock(c, g, [u], start))[u];
    if (bal < price) throw new EconomyError(`Te faltan ${(price - bal).toLocaleString('es-ES')} para comprarlo.`);
    await setBal(c, g, u, -price);
    if (it.stock !== null) await c.query('UPDATE store_items SET stock = stock - 1 WHERE id=$1', [item.id]);
    if (item.type === 'item') await c.query(
      `INSERT INTO user_inventory (guild_id,user_id,item_id) VALUES ($1,$2,$3)
       ON CONFLICT (guild_id,user_id,item_id) DO UPDATE SET quantity = user_inventory.quantity + 1`, [g, u, item.id]);
    await log(c, g, u, 'store_purchase', -price, null, item.name);
    return bal - price;
  });

  try {
    if (role) {
      await member.roles.add(role, `Compra en tienda: ${item.name}`);
      if (item.durationSeconds) await query(
        `INSERT INTO temp_roles (guild_id,user_id,role_id,expires_at) VALUES ($1,$2,$3, now() + make_interval(secs => $4::double precision))
         ON CONFLICT (guild_id,user_id,role_id) DO UPDATE SET expires_at = GREATEST(temp_roles.expires_at, now()) + make_interval(secs => $4::double precision)`,
        [g, u, role.id, item.durationSeconds]);
    }
    if (item.type === 'nickname') await member.setNickname(nickname, `Compra en tienda: ${item.name}`);
  } catch (e) {
    logger.error('Entrega de compra falló, reembolsando:', e);
    await credit(g, u, item.price, 'store_refund', { note: item.name, start });
    if (item.stock !== null) await query('UPDATE store_items SET stock = stock + 1 WHERE id=$1', [item.id]);
    throw new EconomyError('No pude entregarte el artículo. Se reembolsó tu dinero.');
  }
  return { item, balance };
}

// Quita los roles temporales vencidos.
export async function sweepTempRoles(client) {
  const { rows } = await query('SELECT guild_id, user_id, role_id FROM temp_roles WHERE expires_at <= now() LIMIT 100');
  for (const r of rows) {
    try {
      const member = await client.guilds.cache.get(r.guild_id)?.members.fetch(r.user_id).catch(() => null);
      await member?.roles.remove(r.role_id, 'Rol temporal vencido');
    } catch (e) { logger.warn('No se pudo quitar rol temporal:', e.message); }
    await query('DELETE FROM temp_roles WHERE guild_id=$1 AND user_id=$2 AND role_id=$3', [r.guild_id, r.user_id, r.role_id]);
  }
}
