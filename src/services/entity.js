import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { query } from '../db/pool.js';
import { EconomyError } from './economy.js';

const SNOW = /^\d{17,20}$/;

function clean(f, v, guild) {
  const bad = (m) => { throw new EconomyError(`${f.label ?? f.key}: ${m}`); };
  switch (f.type) {
    case 'str': { const s = String(v ?? '').trim(); if (f.req && !s) bad('es obligatorio'); if (s.length > f.max) bad(`máximo ${f.max} caracteres`); return s; }
    case 'int': {
      if (v === null || v === undefined || v === '') { if (f.req) bad('es obligatorio'); return f.nullable ? null : (f.def ?? 0); }
      const n = Number(v); if (!Number.isInteger(n) || n < f.min || n > f.max) bad(`debe estar entre ${f.min} y ${f.max}`); return n;
    }
    case 'bool': return v === undefined ? (f.def ?? false) : !!v;
    case 'channel': case 'role': case 'category': {
      if (!v) { if (f.req) bad('es obligatorio'); return null; }
      const coll = f.type === 'role' ? guild.roles : guild.channels;
      if (!SNOW.test(v) || !coll.cache.has(v)) bad('no es válido');
      if (f.type === 'category' && guild.channels.cache.get(v).type !== ChannelType.GuildCategory) bad('debe ser una categoría');
      return v;
    }
    case 'roles': {
      const a = Array.isArray(v) ? v : [];
      if (a.length > (f.max ?? 10)) bad('demasiados roles');
      for (const r of a) if (!SNOW.test(r) || !guild.roles.cache.has(r)) bad('contiene un rol no válido');
      if (f.req && !a.length) bad('selecciona al menos uno');
      return a;
    }
    case 'assignableRoles': {
      const a = Array.isArray(v) ? v : [];
      if (a.length > (f.max ?? 10)) bad('demasiados roles');
      const blocked = /(owner|co[-_ ]?owner|admin|administrator|staff|moderator|\\bmod\\b|developer|founder|fundador|cofundador|team|equipo)/i;
      for (const id of a) {
        const role = guild.roles.cache.get(id);
        if (!SNOW.test(id) || !role || !role.editable || role.managed || blocked.test(role.name) ||
          role.permissions.any([P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ModerateMembers, P.ManageWebhooks, P.ManageMessages]))
          bad('incluye un rol privilegiado o que el bot no puede asignar');
      }
      if (f.req && !a.length) bad('selecciona al menos uno');
      return a;
    }
    case 'color': return /^#[0-9a-f]{6}$/i.test(v ?? '') ? v : (f.def ?? '#8b5cf6');
    case 'lines': {
      const a = Array.isArray(v) ? v : [];
      if (a.length > f.max) bad(`máximo ${f.max} líneas`);
      return a.map((x) => String(x).trim().slice(0, f.maxLen)).filter(Boolean);
    }
    default: throw new Error(`Tipo de campo desconocido: ${f.type}`);
  }
}

// CRUD genérico por servidor. fields: [{ key, col, type, label, ... }]
export function entity({ table, fields, order = 'id', max = 50, extra = {} }) {
  const out = (r) => {
    if (!r) return null;
    const o = { id: String(r.id) };
    for (const f of fields) o[f.key] = r[f.col];
    for (const [k, c] of Object.entries(extra)) o[k] = r[c];
    return o;
  };
  const values = (body, guild) => fields.map((f) => { const v = clean(f, body?.[f.key], guild); return f.type === 'lines' ? JSON.stringify(v) : v; });
  const cols = fields.map((f) => f.col);
  const validId = (id) => /^\d+$/.test(String(id));
  return {
    async list(g) { return (await query(`SELECT * FROM ${table} WHERE guild_id=$1 ORDER BY ${order}`, [g])).rows.map(out); },
    async get(g, id) { return validId(id) ? out((await query(`SELECT * FROM ${table} WHERE guild_id=$1 AND id=$2`, [g, id])).rows[0]) : null; },
    async create(g, body, guild) {
      const vals = values(body, guild);
      const { rows: [n] } = await query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE guild_id=$1`, [g]);
      if (n.n >= max) throw new EconomyError(`Máximo ${max} elementos.`);
      const ph = vals.map((_, i) => `$${i + 2}`).join(',');
      return out((await query(`INSERT INTO ${table} (guild_id, ${cols.join(',')}) VALUES ($1, ${ph}) RETURNING *`, [g, ...vals])).rows[0]);
    },
    async update(g, id, body, guild) {
      if (!validId(id)) throw new EconomyError('ID inválido.');
      const vals = values(body, guild);
      const set = cols.map((c, i) => `${c}=$${i + 3}`).join(',');
      const r = (await query(`UPDATE ${table} SET ${set} WHERE guild_id=$1 AND id=$2 RETURNING *`, [g, id, ...vals])).rows[0];
      if (!r) throw new EconomyError('Elemento no encontrado.');
      return out(r);
    },
    async remove(g, id) { if (validId(id)) await query(`DELETE FROM ${table} WHERE guild_id=$1 AND id=$2`, [g, id]); },
  };
}
