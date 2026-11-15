import { Events, EmbedBuilder } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

const COLOR = 0x8b5cf6;
async function sendLog(guild, type, title, description, enabledKey) {
  const { enabled, config } = await getModuleState(guild.id, 'logs');
  if (!enabled || !config.channelId || (enabledKey && config[enabledKey] === false)) return;
  const channel = guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased()) return;
  const e = new EmbedBuilder().setColor(COLOR).setTitle(title).setDescription(String(description || 'Sin detalles').slice(0, 3900)).setTimestamp();
  await channel.send({ embeds: [e], allowedMentions: { parse: [] } }).catch((err) => logger.warn('No se pudo enviar log:', err.message));
}

export default {
  commands: [],
  events: [
    { name: Events.MessageDelete, async execute(_c, m) {
      if (!m.guild || m.author?.bot) return;
      await sendLog(m.guild, 'messageDelete', '🗑️ Mensaje eliminado', `**Autor:** ${m.author?.tag ?? 'Desconocido'} (\`${m.author?.id ?? '—'}\`)\n**Canal:** <#${m.channelId}>\n**Contenido:** ${m.content?.slice(0, 1500) || 'No disponible (mensaje parcial o sin caché)'}`, 'messageDelete');
    } },
    { name: Events.MessageUpdate, async execute(_c, before, after) {
      if (!after.guild || after.author?.bot || before.content === after.content) return;
      await sendLog(after.guild, 'messageUpdate', '✏️ Mensaje editado', `**Autor:** ${after.author?.tag ?? 'Desconocido'}\n**Canal:** <#${after.channelId}>\n**Antes:** ${before.content?.slice(0, 1000) || 'No disponible'}\n**Después:** ${after.content?.slice(0, 1000) || 'No disponible'}`, 'messageUpdate');
    } },
    { name: Events.GuildMemberAdd, async execute(_c, m) {
      await sendLog(m.guild, 'memberAdd', '📥 Miembro nuevo', `<@${m.id}> · \`${m.user.tag}\`\nMiembros: **${m.guild.memberCount}**`, 'memberAdd');
    } },
    { name: Events.GuildMemberRemove, async execute(_c, m) {
      await sendLog(m.guild, 'memberRemove', '📤 Miembro salió', `\`${m.user?.tag ?? m.id}\`\nMiembros: **${m.guild.memberCount}**`, 'memberRemove');
    } },
    { name: Events.ChannelCreate, async execute(_c, ch) {
      if (ch.guild) await sendLog(ch.guild, 'channelCreate', '➕ Canal creado', `**Canal:** ${ch.name} (\`${ch.id}\`)\n**Tipo:** ${ch.type}`, 'channelCreate');
    } },
    { name: Events.ChannelDelete, async execute(_c, ch) {
      if (ch.guild) await sendLog(ch.guild, 'channelDelete', '➖ Canal eliminado', `**Canal:** ${ch.name} (\`${ch.id}\`)`, 'channelDelete');
    } },
    { name: Events.GuildBanAdd, async execute(_c, ban) {
      await sendLog(ban.guild, 'guildBanAdd', '🔨 Usuario baneado', `**Usuario:** ${ban.user.tag} (\`${ban.user.id}\`)`, 'guildBanAdd');
    } },
  ],
};
