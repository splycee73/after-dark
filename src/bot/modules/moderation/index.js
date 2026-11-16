import { Events, PermissionFlagsBits as P } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { EconomyError } from '../../../services/economy.js';
import { addCase, warnCount, clearWarns, listCases, parseDuration } from '../../../services/moderation.js';
import { isWhitelisted } from '../../../services/whitelist.js';
import { emitLog } from '../../../lib/bus.js';

const M = 'moderacion';
const RED = 0xf87171;
const reasonOf = (a) => a.razon || 'Sin motivo';
const cfgOf = async (ctx) => (await getModuleState(ctx.guild.id, M)).config;

// Reglas comunes: no sobre ti mismo, ni sobre quien tenga igual o más jerarquía.
function assertTarget(ctx, member, user, verb) {
  if (user.id === ctx.user.id) throw new EconomyError(`No puedes ${verb} a ti mismo.`);
  if (user.id === ctx.client.user.id) throw new EconomyError('No puedo sancionarme a mí mismo.');
  if (!member) return;
  if (member.id === ctx.guild.ownerId) throw new EconomyError('No se puede sancionar al dueño del servidor.');
  if (ctx.guild.ownerId !== ctx.user.id && ctx.member.roles.highest.position <= member.roles.highest.position)
    throw new EconomyError('Esa persona tiene un rol igual o superior al tuyo.');
}
async function record(ctx, user, action, reason, seconds = null) {
  const c = await addCase(ctx.guild.id, user.id, ctx.user.id, action, reason, seconds);
  emitLog(ctx.guild.id, 'mod_action', {
    title: `🛡️ ${action} · caso #${c.number}`, color: RED,
    description: `Usuario: <@${user.id}> (${user.tag ?? user.username})\nModerador: <@${ctx.user.id}>\nMotivo: ${reason}${seconds ? `\nDuración: ${seconds}s` : ''}`,
  });
  return c;
}
async function notify(ctx, user, text) {
  if ((await cfgOf(ctx)).dmOnAction) await user.send(`**${ctx.guild.name}** — ${text}`).catch(() => {});
}
const done = (ctx, title, c, extra = '') => ctx.reply({ embeds: [embed(title, `<@${c.user_id}> · caso **#${c.number}**\nMotivo: ${c.reason || 'Sin motivo'}${extra}`, RED)] });
const USER = { name: 'usuario', type: 'user', description: 'Usuario', required: true };
const REASON = { name: 'razon', type: 'string', description: 'Motivo' };

const ban = defineCommand({
  name: 'ban', description: 'Banea a un usuario', module: M, perms: [P.BanMembers], options: [USER, REASON],
  async run(ctx) {
    const u = ctx.args.usuario, member = await ctx.guild.members.fetch(u.id).catch(() => null), r = reasonOf(ctx.args);
    assertTarget(ctx, member, u, 'banearte');
    if (member && !member.bannable) throw new EconomyError('No puedo banear a esa persona (su rol es superior al mío).');
    await notify(ctx, u, `Fuiste baneado. Motivo: ${r}`);
    await ctx.guild.members.ban(u.id, { reason: `${ctx.user.tag}: ${r}` }).catch(() => { throw new EconomyError('No pude banear a ese usuario.'); });
    await done(ctx, '🔨 Usuario baneado', await record(ctx, u, 'ban', r));
  },
});
const unban = defineCommand({
  name: 'unban', description: 'Quita el ban a un usuario', module: M, perms: [P.BanMembers], options: [USER, REASON],
  async run(ctx) {
    const r = reasonOf(ctx.args);
    await ctx.guild.bans.remove(ctx.args.usuario.id, `${ctx.user.tag}: ${r}`).catch(() => { throw new EconomyError('Ese usuario no está baneado.'); });
    await done(ctx, '♻️ Ban retirado', await record(ctx, ctx.args.usuario, 'unban', r));
  },
});
const kick = defineCommand({
  name: 'kick', description: 'Expulsa a un usuario', module: M, perms: [P.KickMembers], options: [USER, REASON],
  async run(ctx) {
    const u = ctx.args.usuario, member = await ctx.guild.members.fetch(u.id).catch(() => null), r = reasonOf(ctx.args);
    if (!member) throw new EconomyError('Ese usuario no está en el servidor.');
    assertTarget(ctx, member, u, 'expulsarte');
    if (!member.kickable) throw new EconomyError('No puedo expulsar a esa persona (su rol es superior al mío).');
    await notify(ctx, u, `Fuiste expulsado. Motivo: ${r}`);
    await member.kick(`${ctx.user.tag}: ${r}`);
    await done(ctx, '👢 Usuario expulsado', await record(ctx, u, 'kick', r));
  },
});
const timeout = defineCommand({
  name: 'timeout', description: 'Aísla temporalmente a un usuario (ej: 10m, 2h, 1d)', module: M, aliases: ['mute'], perms: [P.ModerateMembers],
  options: [USER, { name: 'duracion', type: 'string', description: 'Duración: 30s, 10m, 2h, 1d, 1w', required: true }, REASON],
  async run(ctx) {
    const secs = parseDuration(ctx.args.duracion);
    if (!secs || secs > 28 * 86400) throw new EconomyError('Duración inválida. Usa por ejemplo `10m`, `2h` o `1d` (máximo 28 días).');
    const u = ctx.args.usuario, member = await ctx.guild.members.fetch(u.id).catch(() => null), r = reasonOf(ctx.args);
    if (!member) throw new EconomyError('Ese usuario no está en el servidor.');
    assertTarget(ctx, member, u, 'aislarte');
    if (!member.moderatable) throw new EconomyError('No puedo aislar a esa persona.');
    await member.timeout(secs * 1000, `${ctx.user.tag}: ${r}`);
    await notify(ctx, u, `Fuiste aislado ${ctx.args.duracion}. Motivo: ${r}`);
    await done(ctx, '🔇 Usuario aislado', await record(ctx, u, 'timeout', r, secs), `\nDuración: ${ctx.args.duracion}`);
  },
});
const untimeout = defineCommand({
  name: 'untimeout', description: 'Quita el aislamiento a un usuario', module: M, aliases: ['unmute'], perms: [P.ModerateMembers], options: [USER],
  async run(ctx) {
    const member = await ctx.guild.members.fetch(ctx.args.usuario.id).catch(() => null);
    if (!member?.moderatable) throw new EconomyError('No puedo modificar a ese usuario.');
    await member.timeout(null);
    await done(ctx, '🔊 Aislamiento retirado', await record(ctx, ctx.args.usuario, 'untimeout', ''));
  },
});
const warn = defineCommand({
  name: 'warn', description: 'Avisa a un usuario', module: M, perms: [P.ModerateMembers], options: [USER, REASON],
  async run(ctx) {
    const u = ctx.args.usuario, member = await ctx.guild.members.fetch(u.id).catch(() => null), r = reasonOf(ctx.args);
    assertTarget(ctx, member, u, 'avisarte');
    const c = await record(ctx, u, 'warn', r);
    await notify(ctx, u, `Recibiste un aviso. Motivo: ${r}`);
    const n = await warnCount(ctx.guild.id, u.id), cfg = await cfgOf(ctx);
    let extra = `\nAvisos acumulados: **${n}**`;
    if (cfg.warnsForTimeout > 0 && n >= cfg.warnsForTimeout && member?.moderatable) {
      await member.timeout(cfg.timeoutMinutes * 60000, 'Avisos acumulados').catch(() => {});
      extra += `\n⏳ Aislado automáticamente ${cfg.timeoutMinutes} min por acumular avisos.`;
    }
    await done(ctx, '⚠️ Aviso registrado', c, extra);
  },
});
const warnings = defineCommand({
  name: 'warnings', description: 'Historial de sanciones de un usuario', module: M, aliases: ['cases'], perms: [P.ModerateMembers],
  options: [{ name: 'usuario', type: 'user', description: 'Usuario' }],
  async run(ctx) {
    const u = ctx.args.usuario ?? ctx.user, rows = await listCases(ctx.guild.id, { userId: u.id, limit: 15 });
    await ctx.reply({ embeds: [embed(`📋 Casos de ${u.username}`, rows.length ? rows.map((c) => `**#${c.number}** · ${c.action} · ${c.reason || 'Sin motivo'} · <t:${Math.floor(new Date(c.at) / 1000)}:R>`).join('\n') : 'Sin casos.')] });
  },
});
const clearwarnsCmd = defineCommand({
  name: 'clearwarns', description: 'Borra los avisos de un usuario', module: M, perms: [P.ModerateMembers], options: [USER],
  async run(ctx) {
    await clearWarns(ctx.guild.id, ctx.args.usuario.id);
    await ctx.reply({ embeds: [embed('🧹 Avisos borrados', `Se borraron los avisos de <@${ctx.args.usuario.id}>.`)] });
  },
});
const clear = defineCommand({
  name: 'clear', description: 'Elimina entre 1 y 100 mensajes recientes del canal', module: M, aliases: ['purge'], perms: [P.ManageMessages], defer: 'ephemeral',
  options: [{ name: 'cantidad', type: 'int', description: 'Cantidad de mensajes (1-100)', required: true }],
  async run(ctx) {
    const n = ctx.args.cantidad;
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      throw new EconomyError('Indica una cantidad entre 1 y 100 mensajes.');
    }
    if (!ctx.channel?.bulkDelete) {
      throw new EconomyError('Este comando solo funciona en canales de texto compatibles.');
    }
    const del = await ctx.channel.bulkDelete(n, true).catch((error) => {
      if (error?.code === 50013) throw new EconomyError('No tengo permiso para administrar mensajes en este canal.');
      throw new EconomyError('No pude borrar los mensajes. Comprueba mis permisos e inténtalo de nuevo.');
    });
    const skipped = n - del.size;
    emitLog(ctx.guild.id, 'mod_action', {
      title: '🧹 Mensajes eliminados',
      color: RED,
      description: `Moderador: <@${ctx.user.id}>\\nCanal: <#${ctx.channel.id}>\\nEliminados: **${del.size}**${skipped > 0 ? `\\nOmitidos (por antigüedad u otras restricciones): **${skipped}**` : ''}`,
    });
    await ctx.reply({
      content: `🧹 Se eliminaron **${del.size}** mensajes.${skipped > 0 ? ` Se omitieron **${skipped}** mensajes (Discord no permite borrar mensajes de más de 14 días mediante borrado masivo).` : ''}`,
      ephemeral: true,
    });
  },
});
const slowmode = defineCommand({
  name: 'slowmode', description: 'Modo lento del canal en segundos (0 = desactivar)', module: M, perms: [P.ManageChannels],
  options: [{ name: 'segundos', type: 'string', description: '0 a 21600', required: true }],
  async run(ctx) {
    const s = Number(ctx.args.segundos);
    if (!Number.isInteger(s) || s < 0 || s > 21600) throw new EconomyError('Indica un número de segundos entre 0 y 21600.');
    await ctx.channel.setRateLimitPerUser(s, `Slowmode por ${ctx.user.tag}`);
    await ctx.reply({ embeds: [embed('🐢 Modo lento', s ? `Ahora hay **${s}s** entre mensajes.` : 'Modo lento desactivado.')] });
  },
});
const lockFn = (name, descr, value) => defineCommand({
  name, description: descr, module: M, perms: [P.ManageChannels],
  async run(ctx) {
    await ctx.channel.permissionOverwrites.edit(ctx.guild.id, { SendMessages: value }, { reason: `${name} por ${ctx.user.tag}` });
    await ctx.reply({ embeds: [embed(value === false ? '🔒 Canal bloqueado' : '🔓 Canal desbloqueado', value === false ? 'Nadie puede escribir aquí.' : 'Ya se puede escribir de nuevo.')] });
  },
});

// ---------- Automoderación ----------
const INVITE = /(discord\.gg|discord(app)?\.com\/invite)\/\w+/i;
const LINK = /https?:\/\/\S+/i;
const spam = new Map();
const wordCache = new Map();
const wordRegex = (list) => {
  if (!list.trim()) return null;
  if (!wordCache.has(list)) {
    const words = list.split(',').map((w) => w.trim()).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    wordCache.set(list, words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${words.join('|')})(?![\\p{L}\\p{N}])`, 'iu') : null);
    if (wordCache.size > 200) wordCache.clear();
  }
  return wordCache.get(list);
};

async function automod(client, m) {
  if (m.author.bot || !m.guild || !m.member) return;
  const { enabled, config: c } = await getModuleState(m.guild.id, M);
  if (!enabled || !c.automodEnabled) return;
  if (m.member.permissions.has(P.ManageMessages) || c.exemptRoleIds.some((r) => m.member.roles.cache.has(r))) return;
  const wl = await getModuleState(m.guild.id, 'whitelist');
  if (wl.enabled && wl.config.bypassAutomod && await isWhitelisted(m.guild.id, m.author.id)) return;

  let reason = null;
  const bad = wordRegex(c.badWords);
  if (c.antiInvites && INVITE.test(m.content)) reason = 'invitación de Discord';
  else if (c.antiLinks && LINK.test(m.content)) reason = 'enlace no permitido';
  else if (c.maxMentions > 0 && m.mentions.users.size >= c.maxMentions) reason = 'menciones masivas';
  else if (bad?.test(m.content)) reason = 'palabra prohibida';
  else if (c.antiSpam) {
    const key = `${m.guild.id}:${m.author.id}`, now = Date.now();
    const arr = (spam.get(key) ?? []).filter((t) => now - t < c.spamSeconds * 1000);
    arr.push(now); spam.set(key, arr);
    if (spam.size > 5000) spam.clear();
    if (arr.length > c.spamMessages) { reason = 'spam'; spam.delete(key); }
  }
  if (!reason) return;

  await m.delete().catch(() => {});
  const note = await m.channel.send({ content: `⚠️ <@${m.author.id}>, tu mensaje fue eliminado: ${reason}.`, allowedMentions: { users: [m.author.id] } }).catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => {}), 6000);
  const cs = await addCase(m.guild.id, m.author.id, client.user.id, 'warn', `Automod: ${reason}`);
  emitLog(m.guild.id, 'mod_action', { title: `🤖 Automod · caso #${cs.number}`, color: RED, description: `Usuario: <@${m.author.id}>\nMotivo: ${reason}` });
  const n = await warnCount(m.guild.id, m.author.id);
  if (c.warnsForTimeout > 0 && n >= c.warnsForTimeout && m.member.moderatable) {
    await m.member.timeout(c.timeoutMinutes * 60000, 'Automod: avisos acumulados').catch(() => {});
  }
}

export default {
  commands: [ban, unban, kick, timeout, untimeout, warn, warnings, clearwarnsCmd, clear, slowmode, lockFn('lock', 'Bloquea el canal actual', false), lockFn('unlock', 'Desbloquea el canal actual', null)],
  events: [{ name: Events.MessageCreate, execute: automod }],
};
