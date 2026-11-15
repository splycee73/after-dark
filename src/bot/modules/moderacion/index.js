import { PermissionFlagsBits } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { EconomyError } from '../../../services/economy.js';
import { addWarning, getWarnings } from '../../../services/moderation.js';

const requirePermission = (ctx, permission, label) => {
  if (!ctx.member.permissions.has(permission)) throw new EconomyError(`Necesitas el permiso **${label}**.`);
  if (!ctx.guild.members.me?.permissions.has(permission)) throw new EconomyError(`Al bot le falta el permiso **${label}**.`);
};

const assertHierarchy = (ctx, target) => {
  if (ctx.user.id !== ctx.guild.ownerId && target.roles.highest.position >= ctx.member.roles.highest.position) {
    throw new EconomyError('No puedes moderar a alguien con un rol igual o superior al tuyo.');
  }
};

const ban = defineCommand({
  name: 'ban', description: 'Banea a un miembro del servidor', module: 'moderacion',
  options: [{ name: 'usuario', type: 'user', description: 'Miembro que será baneado', required: true },
    { name: 'motivo', type: 'string', description: 'Motivo del baneo' }],
  async run(ctx) {
    requirePermission(ctx, PermissionFlagsBits.BanMembers, 'Banear miembros');
    const target = await ctx.guild.members.fetch(ctx.args.usuario.id).catch(() => null);
    if (!target) throw new EconomyError('Ese usuario no está en el servidor.');
    assertHierarchy(ctx, target);\n    if (!target.bannable) throw new EconomyError('No puedo banear a ese miembro por la jerarquía del bot o sus permisos.');
    const reason = ctx.args.motivo || `Baneado por ${ctx.user.tag}`;
    await target.ban({ reason: reason.slice(0, 500), deleteMessageSeconds: 0 });
    await ctx.reply({ embeds: [embed('🔨 Miembro baneado', `**Usuario:** <@${target.id}>\n**Motivo:** ${reason}`)] });
  },
});

const kick = defineCommand({
  name: 'kick', description: 'Expulsa a un miembro del servidor', module: 'moderacion',
  options: [{ name: 'usuario', type: 'user', description: 'Miembro que será expulsado', required: true },
    { name: 'motivo', type: 'string', description: 'Motivo de la expulsión' }],
  async run(ctx) {
    requirePermission(ctx, PermissionFlagsBits.KickMembers, 'Expulsar miembros');
    const target = await ctx.guild.members.fetch(ctx.args.usuario.id).catch(() => null);
    if (!target) throw new EconomyError('Ese usuario no está en el servidor.');
    assertHierarchy(ctx, target);\n    if (!target.kickable) throw new EconomyError('No puedo expulsar a ese miembro por la jerarquía del bot o sus permisos.');
    const reason = ctx.args.motivo || `Expulsado por ${ctx.user.tag}`;
    await target.kick(reason.slice(0, 500));
    await ctx.reply({ embeds: [embed('👢 Miembro expulsado', `**Usuario:** <@${target.id}>\n**Motivo:** ${reason}`)] });
  },
});

const timeout = defineCommand({
  name: 'timeout', description: 'Silencia temporalmente a un miembro (minutos)', module: 'moderacion',
  options: [{ name: 'usuario', type: 'user', description: 'Miembro', required: true },
    { name: 'minutos', type: 'int', description: 'Duración en minutos (1–40320)', required: true },
    { name: 'motivo', type: 'string', description: 'Motivo' }],
  async run(ctx) {
    requirePermission(ctx, PermissionFlagsBits.ModerateMembers, 'Moderar miembros');
    const minutes = ctx.args.minutos;
    if (minutes < 1 || minutes > 40320) throw new EconomyError('La duración debe ser de 1 a 40320 minutos.');
    const target = await ctx.guild.members.fetch(ctx.args.usuario.id).catch(() => null);
    if (!target) throw new EconomyError('Ese usuario no está en el servidor.');\n    assertHierarchy(ctx, target);\n    if (!target.moderatable) throw new EconomyError('No puedo aplicar timeout a ese miembro por la jerarquía del bot o sus permisos.');
    await target.timeout(minutes * 60_000, (ctx.args.motivo || 'Sin motivo').slice(0, 500));
    await ctx.reply({ embeds: [embed('⏳ Timeout aplicado', `**Usuario:** <@${target.id}>\n**Duración:** ${minutes} minutos\n**Motivo:** ${ctx.args.motivo || 'Sin motivo'}`)] });
  },
});

const warn = defineCommand({
  name: 'warn', description: 'Registra una advertencia para un miembro', module: 'moderacion',
  options: [{ name: 'usuario', type: 'user', description: 'Miembro', required: true },
    { name: 'motivo', type: 'string', description: 'Motivo de la advertencia', required: true }],
  async run(ctx) {
    requirePermission(ctx, PermissionFlagsBits.ModerateMembers, 'Moderar miembros');
    const row = await addWarning(ctx.guild.id, ctx.args.usuario.id, ctx.user.id, ctx.args.motivo);
    await ctx.reply({ embeds: [embed('⚠️ Advertencia registrada', `**Usuario:** <@${ctx.args.usuario.id}>\n**ID:** #${row.id}\n**Motivo:** ${ctx.args.motivo}`)] });
  },
});

const warnings = defineCommand({
  name: 'warnings', description: 'Consulta las advertencias de un miembro', module: 'moderacion',
  options: [{ name: 'usuario', type: 'user', description: 'Miembro (por defecto tú)' }],
  async run(ctx) {
    requirePermission(ctx, PermissionFlagsBits.ModerateMembers, 'Moderar miembros');
    const user = ctx.args.usuario || ctx.user;
    const rows = await getWarnings(ctx.guild.id, user.id);
    const body = rows.length ? rows.map((w) => `**#${w.id}** · ${w.reason} · <t:${Math.floor(new Date(w.createdAt).getTime()/1000)}:R> · mod: <@${w.moderatorId}>`).join('\n') : 'No tiene advertencias registradas.';
    await ctx.reply({ embeds: [embed(`⚠️ Advertencias de ${user.username}`, body)], ephemeral: true });
  },
});

export default { commands: [ban, kick, timeout, warn, warnings], events: [] };
