import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { query } from '../db/pool.js';
import { EconomyError } from './economy.js';
import { hexToInt } from './messages.js';

const https = (u) => typeof u === 'string' && /^https:\/\/\S+$/.test(u.trim());
const cut = (s, n) => String(s ?? '').trim().slice(0, n);

export function buildEmbed(d) {
  const e = new EmbedBuilder().setColor(hexToInt(d.color));
  if (d.title) e.setTitle(cut(d.title, 256));
  if (d.title && https(d.url)) e.setURL(d.url.trim());
  if (d.description) e.setDescription(cut(d.description, 4000));
  if (d.author?.name) e.setAuthor({ name: cut(d.author.name, 256), iconURL: https(d.author.iconUrl) ? d.author.iconUrl.trim() : undefined });
  if (https(d.thumbnail)) e.setThumbnail(d.thumbnail.trim());
  if (https(d.image)) e.setImage(d.image.trim());
  if (d.footer?.text) e.setFooter({ text: cut(d.footer.text, 2048), iconURL: https(d.footer.iconUrl) ? d.footer.iconUrl.trim() : undefined });
  if (d.timestamp) e.setTimestamp();
  const fields = (Array.isArray(d.fields) ? d.fields : []).filter((f) => f?.name && f?.value).slice(0, 25)
    .map((f) => ({ name: cut(f.name, 256), value: cut(f.value, 1024), inline: !!f.inline }));
  if (fields.length) e.addFields(fields);
  const j = e.toJSON();
  if (!j.title && !j.description && !j.fields?.length && !j.image && !j.author) throw new EconomyError('El embed está vacío.');
  return e;
}

export function buildButtons(d) {
  const links = (Array.isArray(d.buttons) ? d.buttons : []).filter((b) => b?.label && https(b.url)).slice(0, 5);
  if (!links.length) return [];
  return [new ActionRowBuilder().addComponents(links.map((b) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(cut(b.label, 80)).setURL(b.url.trim())))];
}

export async function sendEmbed(guild, channelId, data) {
  const ch = /^\d{17,20}$/.test(channelId ?? '') && guild.channels.cache.get(channelId);
  if (!ch?.isTextBased()) throw new EconomyError('Selecciona un canal válido.');
  const embed = buildEmbed(data);
  try { await ch.send({ embeds: [embed], components: buildButtons(data), allowedMentions: { parse: [] } }); }
  catch { throw new EconomyError('No pude enviar el embed. Revisa los permisos del bot en ese canal.'); }
}

export const listTemplates = async (g) =>
  (await query('SELECT id, name, data FROM embed_templates WHERE guild_id=$1 ORDER BY name', [g])).rows.map((r) => ({ id: String(r.id), name: r.name, data: r.data }));

export async function saveTemplate(g, name, data) {
  const n = cut(name, 60);
  if (!n) throw new EconomyError('Ponle un nombre a la plantilla.');
  buildEmbed(data); // valida
  const { rows: [c] } = await query('SELECT COUNT(*)::int AS n FROM embed_templates WHERE guild_id=$1 AND name<>$2', [g, n]);
  if (c.n >= 50) throw new EconomyError('Máximo 50 plantillas.');
  const clean = JSON.stringify(data).length > 20000 ? null : data;
  if (!clean) throw new EconomyError('La plantilla es demasiado grande.');
  const upd = await query('UPDATE embed_templates SET data=$3 WHERE guild_id=$1 AND name=$2', [g, n, JSON.stringify(clean)]);
  if (!upd.rowCount) await query('INSERT INTO embed_templates (guild_id, name, data) VALUES ($1,$2,$3)', [g, n, JSON.stringify(clean)]);
}
export const deleteTemplate = (g, id) => /^\d+$/.test(String(id)) ? query('DELETE FROM embed_templates WHERE guild_id=$1 AND id=$2', [g, id]) : null;
