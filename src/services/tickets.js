import {
  ChannelType, PermissionFlagsBits as P, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder,
} from 'discord.js';
import { query, withTx } from '../db/pool.js';
import { EconomyError } from './economy.js';
import { getModuleState } from './guilds.js';
import { entity } from './entity.js';
import { emitLog } from '../lib/bus.js';
import { render, hexToInt } from './messages.js';

export const categories = entity({
  table: 'ticket_categories', order: 'position, id', max: 25,
  fields: [
    { key: 'name', col: 'name', type: 'str', max: 80, req: true, label: 'Nombre' },
    { key: 'emoji', col: 'emoji', type: 'str', max: 60, label: 'Emoji' },
    { key: 'description', col: 'description', type: 'str', max: 100, label: 'Descripción' },
    { key: 'parentId', col: 'parent_id', type: 'category', label: 'Categoría de Discord' },
    { key: 'supportRoleIds', col: 'support_role_ids', type: 'roles', label: 'Roles de soporte extra' },
    { key: 'welcomeMessage', col: 'welcome_message', type: 'str', max: 500, label: 'Mensaje de bienvenida' },
    { key: 'questions', col: 'questions', type: 'lines', max: 5, maxLen: 45, label: 'Preguntas del formulario' },
    { key: 'enabled', col: 'enabled', type: 'bool', def: true, label: 'Activa' },
  ],
});

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'ticket';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EMOJI = /^(\p{Extended_Pictographic}|<a?:\w+:\d+>)/u;

export const isSupport = (member, cfg, cat) =>
  member.permissions.has(P.ManageGuild) || [...cfg.supportRoleIds, ...(cat?.supportRoleIds ?? [])].some((r) => member.roles.cache.has(r));

export async function getByChannel(channelId) {
  const { rows: [t] } = await query(
    `SELECT t.*, c.support_role_ids AS cat_roles FROM tickets t LEFT JOIN ticket_categories c ON c.id = t.category_id WHERE t.channel_id=$1`, [channelId]);
  return t ?? null;
}

export async function openTicket({ guild, member, categoryId, answers = [] }) {
  const { config: cfg } = await getModuleState(guild.id, 'tickets');
  const cat = await categories.get(guild.id, categoryId);
  if (!cat || !cat.enabled) throw new EconomyError('Esta categoría ya no está disponible.');

  const ticket = await withTx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ticket:${guild.id}`]);
    if (cfg.maxPerUser > 0) {
      const { rows: [n] } = await c.query("SELECT COUNT(*)::int AS n FROM tickets WHERE guild_id=$1 AND owner_id=$2 AND status='open'", [guild.id, member.id]);
      if (n.n >= cfg.maxPerUser) throw new EconomyError(`Ya tienes ${n.n} ticket(s) abierto(s) (máximo ${cfg.maxPerUser}).`);
    }
    return (await c.query(
      `INSERT INTO tickets (guild_id, number, category_id, owner_id, answers)
       VALUES ($1, (SELECT COALESCE(MAX(number),0)+1 FROM tickets WHERE guild_id=$1), $2, $3, $4) RETURNING *`,
      [guild.id, cat.id, member.id, JSON.stringify(answers)])).rows[0];
  });

  const supportRoles = [...new Set([...cfg.supportRoleIds, ...cat.supportRoleIds])].filter((r) => guild.roles.cache.has(r));
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
  let channel;
  try {
    channel = await guild.channels.create({
      name: `${slug(cat.name)}-${String(ticket.number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: cat.parentId && guild.channels.cache.has(cat.parentId) ? cat.parentId : undefined,
      topic: `Ticket #${ticket.number} · ${member.user.tag} · ${cat.name}`,
      permissionOverwrites: [
        { id: guild.id, deny: [P.ViewChannel] },
        { id: member.id, allow },
        ...supportRoles.map((id) => ({ id, allow: [...allow, P.ManageMessages] })),
        { id: guild.members.me.id, allow: [...allow, P.ManageChannels, P.ManageMessages] },
      ],
    });
  } catch (e) {
    await query('DELETE FROM tickets WHERE id=$1', [ticket.id]);
    throw new EconomyError('No pude crear el canal del ticket. Revisa que el bot tenga el permiso "Gestionar canales".');
  }
  await query('UPDATE tickets SET channel_id=$2 WHERE id=$1', [ticket.id, channel.id]);

  const e = new EmbedBuilder().setColor(hexToInt(cfg.panelColor)).setTitle(`${cat.emoji} ${cat.name} · #${ticket.number}`.trim())
    .setDescription(render(cat.welcomeMessage || cfg.welcomeMessage, { user: `<@${member.id}>`, category: cat.name }) || '\u200b')
    .setTimestamp();
  cat.questions.forEach((q, i) => answers[i] && e.addFields({ name: q.slice(0, 256), value: String(answers[i]).slice(0, 1024) }));
  const row = new ActionRowBuilder();
  if (cfg.claimEnabled) row.addComponents(new ButtonBuilder().setCustomId('tk:claim').setLabel('Reclamar').setEmoji('🙋').setStyle(ButtonStyle.Success));
  row.addComponents(new ButtonBuilder().setCustomId('tk:close').setLabel('Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger));
  await channel.send({
    content: `<@${member.id}> ${supportRoles.map((r) => `<@&${r}>`).join(' ')}`.trim(), embeds: [e], components: [row],
    allowedMentions: { users: [member.id], roles: supportRoles },
  });
  emitLog(guild.id, 'ticket', { title: `🎫 Ticket #${ticket.number} abierto`, description: `<@${member.id}> abrió un ticket en **${cat.name}**: <#${channel.id}>` });
  return { ticket, channel };
}

export async function claimTicket({ ticket, member }) {
  const { rowCount } = await query("UPDATE tickets SET claimed_by=$2 WHERE id=$1 AND claimed_by IS NULL AND status='open'", [ticket.id, member.id]);
  if (!rowCount) throw new EconomyError('Este ticket ya fue reclamado o está cerrado.');
}

async function buildTranscript(channel, t) {
  const all = [];
  let before;
  for (let i = 0; i < 10; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  all.reverse();
  const rows = all.map((m) => `<div class="m"><b>${esc(m.author.tag)}</b> <span>${m.createdAt.toISOString().replace('T', ' ').slice(0, 19)}</span><p>${esc(m.content).replace(/\n/g, '<br>')}${
    [...m.attachments.values()].map((a) => `<br><a href="${esc(a.url)}">📎 ${esc(a.name)}</a>`).join('')}${m.embeds.length ? '<br><i>[embed]</i>' : ''}</p></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Ticket #${t.number}</title><style>body{background:#0b0a12;color:#e6e4f5;font:14px system-ui;max-width:800px;margin:20px auto;padding:0 16px}.m{padding:8px 0;border-bottom:1px solid #26233a}.m span{color:#8f8da6;font-size:12px}p{margin:4px 0}a{color:#a78bfa}</style><h2>Ticket #${t.number}</h2>${rows}`;
}

export async function closeTicket({ client, guild, channel, ticket, closer, reason }) {
  const why = reason || 'Sin motivo';
  const { rows: [t] } = await query(
    "UPDATE tickets SET status='closed', closed_at=now(), closed_by=$2, close_reason=$3 WHERE id=$1 AND status='open' RETURNING *", [ticket.id, closer.id, why]);
  if (!t) throw new EconomyError('Este ticket ya está cerrado.');
  const { config: cfg } = await getModuleState(guild.id, 'tickets');
  const html = await buildTranscript(channel, t).catch(() => '<p>No se pudo generar la transcripción.</p>');
  await query('UPDATE tickets SET transcript=$2 WHERE id=$1', [t.id, html]);
  const file = () => new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `ticket-${t.number}.html` });

  const logCh = cfg.transcriptChannelId && guild.channels.cache.get(cfg.transcriptChannelId);
  if (logCh?.isTextBased()) {
    await logCh.send({ content: `📄 Transcripción del ticket #${t.number} · dueño <@${t.owner_id}> · cerrado por <@${closer.id}>\nMotivo: ${why}`, files: [file()], allowedMentions: { parse: [] } }).catch(() => {});
  }
  const owner = await client.users.fetch(t.owner_id).catch(() => null);
  if (owner) {
    if (cfg.dmTranscript) await owner.send({ content: `Tu ticket #${t.number} en **${guild.name}** fue cerrado.`, files: [file()] }).catch(() => {});
    if (cfg.ratingEnabled) {
      const row = new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) =>
        new ButtonBuilder().setCustomId(`tk:rate:${t.id}:${n}`).setLabel('⭐'.repeat(n)).setStyle(ButtonStyle.Secondary)));
      await owner.send({ content: `¿Cómo valoras la atención recibida en el ticket #${t.number}?`, components: [row] }).catch(() => {});
    }
  }
  await channel.permissionOverwrites.edit(t.owner_id, { ViewChannel: false }).catch(() => {});
  const del = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk:delete').setLabel('Eliminar canal').setEmoji('🗑️').setStyle(ButtonStyle.Danger));
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xf87171).setDescription(render(cfg.closeMessage, { closer: `<@${closer.id}>`, reason: why }))],
    components: [del], allowedMentions: { parse: [] },
  });
  emitLog(guild.id, 'ticket', { title: `🔒 Ticket #${t.number} cerrado`, description: `Cerrado por <@${closer.id}> · dueño <@${t.owner_id}>\nMotivo: ${why}` });
}

export async function rateTicket(ticketId, userId, n) {
  const { rows: [t] } = await query('UPDATE tickets SET rating=$3 WHERE id=$1 AND owner_id=$2 AND rating IS NULL RETURNING guild_id, number', [ticketId, userId, n]);
  if (t) emitLog(t.guild_id, 'ticket', { title: `⭐ Valoración del ticket #${t.number}`, description: `<@${userId}> valoró con **${n}/5**` });
  return !!t;
}

export async function sendPanel(guild) {
  const { config: cfg } = await getModuleState(guild.id, 'tickets');
  const cats = (await categories.list(guild.id)).filter((c) => c.enabled);
  const ch = cfg.panelChannelId && guild.channels.cache.get(cfg.panelChannelId);
  if (!ch?.isTextBased()) throw new EconomyError('Selecciona (y guarda) un canal para el panel de tickets.');
  if (!cats.length) throw new EconomyError('Crea al menos una categoría activa.');
  const rows = [];
  for (let i = 0; i < Math.min(cats.length, 25); i += 5) {
    rows.push(new ActionRowBuilder().addComponents(cats.slice(i, i + 5).map((c) => {
      const b = new ButtonBuilder().setCustomId(`tk:open:${c.id}`).setLabel(c.name.slice(0, 80)).setStyle(ButtonStyle.Primary);
      if (c.emoji && EMOJI.test(c.emoji)) b.setEmoji(c.emoji);
      return b;
    })));
  }
  const e = new EmbedBuilder().setColor(hexToInt(cfg.panelColor)).setTitle(cfg.panelTitle).setDescription(cfg.panelDescription);
  const desc = cats.filter((c) => c.description).map((c) => `${c.emoji} **${c.name}** — ${c.description}`).join('\n');
  if (desc) e.addFields({ name: '\u200b', value: desc.slice(0, 1024) });
  try { await ch.send({ embeds: [e], components: rows }); }
  catch { throw new EconomyError('No pude enviar el panel. Revisa los permisos del bot en ese canal.'); }
}

export async function recentTickets(g, limit = 25) {
  const { rows } = await query(
    `SELECT t.id, t.number, t.owner_id, t.status, t.claimed_by, t.rating, t.created_at, (t.transcript IS NOT NULL) AS has_transcript, c.name AS category
     FROM tickets t LEFT JOIN ticket_categories c ON c.id = t.category_id WHERE t.guild_id=$1 ORDER BY t.id DESC LIMIT $2`, [g, limit]);
  return rows.map((r) => ({ id: String(r.id), number: r.number, ownerId: r.owner_id, status: r.status, claimedBy: r.claimed_by, rating: r.rating, at: r.created_at, hasTranscript: r.has_transcript, category: r.category }));
}
export async function getTranscript(g, id) {
  if (!/^\d+$/.test(String(id))) return null;
  const { rows: [r] } = await query('SELECT number, transcript FROM tickets WHERE guild_id=$1 AND id=$2', [g, id]);
  return r?.transcript ? r : null;
}
