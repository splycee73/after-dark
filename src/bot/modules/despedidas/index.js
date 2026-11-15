import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

const fill = (value, member) => String(value ?? '')
  .replace(/\{username\}/g, member.user?.username ?? member.id)
  .replace(/\{server\}/g, member.guild.name)
  .replace(/\{count\}/g, String(member.guild.memberCount));

export default {
  commands: [],
  events: [{
    name: Events.GuildMemberRemove,
    async execute(_client, member) {
      const { enabled, config } = await getModuleState(member.guild.id, 'despedidas');
      if (!enabled || !config.channelId) return;
      const channel = member.guild.channels.cache.get(config.channelId);
      if (!channel?.isTextBased()) return;
      await channel.send({
        content: fill(config.message, member),
        allowedMentions: { parse: [] },
      }).catch((e) => logger.warn('Despedida no enviada:', e.message));
    },
  }],
};
