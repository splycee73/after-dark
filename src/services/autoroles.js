import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { query } from '../db/pool.js';
import { entity } from './entity.js';
import { EconomyError } from './economy.js';
import { hexToInt } from './messages.js';

export const panels = entity({
  table: 'role_panels', max: 20, extra: { messageId: 'message_id' },
  fields: [
    { key: 'name', col: 'name', type: 'str', max: 60, req: true, label: 'Nombre' },
    { key: 'channelId', col: 'channel_id', type: 'channel', label: 'Canal' },
    { key: 'title', col: 'title', type: 'str', max: 256, label: 'Título' },
    { key: 'description', col: 'description', type: 'str', max: 1500, label: 'Descripción' },
    { key: 'color', col: 'color', type: 'color', label: 'Color' },
    { key: 'exclusive', col: 'exclusive', type: 'bool', label: 'Solo un rol a la vez' },
    { key: 'roleIds', col: 'role_ids', type: 'roles', max: 25, req: true, label: 'Roles' },
  ],
});

export async function sendPanel(guild, id) {
  const p = await panels.get(guild.id, id);
  if (!p) throw new EconomyError('Panel no encontrado.');
  const ch = p.channelId && guild.channels.cache.get(p.channelId);
  if (!ch?.isTextBased()) throw new EconomyError('Selecciona un canal para el panel y guarda antes de enviarlo.');
  const roles = p.roleIds.map((r) => guild.roles.cache.get(r)).filter(Boolean);
  if (!roles.length) throw new EconomyError('El panel no tiene roles válidos.');
  const rows = [];
  for (let i = 0; i < roles.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(roles.slice(i, i + 5).map((r) =>
      new ButtonBuilder().setCustomId(`ar:${p.id}:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary))));
  }
  const e = new EmbedBuilder().setColor(hexToInt(p.color)).setTitle(p.title || p.name).setDescription(p.description || 'Pulsa un botón para obtener o quitar un rol.');
  const msg = await ch.send({ embeds: [e], components: rows }).catch(() => { throw new EconomyError('No pude enviar el panel. Revisa los permisos del bot.'); });
  await query('UPDATE role_panels SET message_id=$2 WHERE id=$1', [p.id, msg.id]);
}

export async function toggleRole(interaction) {
  const [, panelId, roleId] = interaction.customId.split(':');
  const p = await panels.get(interaction.guild.id, panelId);
  if (!p || !p.roleIds.includes(roleId)) return interaction.reply({ content: 'Este panel ya no es válido.', ephemeral: true });
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role || !role.editable) return interaction.reply({ content: 'No puedo gestionar ese rol (revisa la jerarquía del bot).', ephemeral: true });
  if (role.permissions.has([P.Administrator]) || role.permissions.has([P.ManageGuild]) || role.permissions.has([P.ManageRoles]))
    return interaction.reply({ content: 'Por seguridad, los autoroles no pueden entregar roles con permisos de administración.', ephemeral: true });
  const m = interaction.member;
  if (m.roles.cache.has(roleId)) {
    await m.roles.remove(roleId, 'Autorol');
    return interaction.reply({ content: `➖ Se te quitó **${role.name}**.`, ephemeral: true });
  }
  if (p.exclusive) {
    const others = p.roleIds.filter((r) => r !== roleId && m.roles.cache.has(r));
    if (others.length) await m.roles.remove(others, 'Autorol exclusivo');
  }
  await m.roles.add(roleId, 'Autorol');
  return interaction.reply({ content: `➕ Ahora tienes **${role.name}**.`, ephemeral: true });
}
