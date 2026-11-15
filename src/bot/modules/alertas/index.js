import { Events, EmbedBuilder } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

const joins = new Map();
const COLOR = 0xf59e0b;

async function alert(guild, title, description, cfg) {
  if (!cfg.channelId) return;
  const channel = guild.channels.cache.get(cfg.channelId);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(title).setDescription(description).setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch((e) => logger.warn('Alerta no enviada:', e.message));
}

export default {
  commands: [],
  events: [
    { name: Events.GuildMemberAdd, async execute(_client, member) {
      const { enabled, config: cfg } = await getModuleState(member.guild.id, 'alertas');
      if (!enabled) return;
      const windowMs = Math.max(10, cfg.joinWindowSeconds) * 1000;
      const now = Date.now();
      const list = (joins.get(member.guild.id) ?? []).filter((t) => now - t < windowMs);
      list.push(now); joins.set(member.guild.id, list);
      if (list.length === cfg.joinThreshold) {
        await alert(member.guild, '⚠️ Posible raid detectada', `Entraron **${list.length} miembros** en ${cfg.joinWindowSeconds} segundos.`, cfg);
      }
    } },
    { name: Events.MessageCreate, async execute(_client, message) {
      if (!message.guild || message.author.bot) return;
      const { enabled, config: cfg } = await getModuleState(message.guild.id, 'alertas');
      if (!enabled || !cfg.massMentionEnabled) return;
      const mentions = message.mentions.users.size + message.mentions.roles.size;
      if (mentions >= cfg.mentionThreshold) {
        await alert(message.guild, '📣 Mención masiva detectada', `**Usuario:** <@${message.author.id}>\n**Canal:** <#${message.channelId}>\n**Menciones:** ${mentions}`, cfg);
      }
    } },
  ],
};
