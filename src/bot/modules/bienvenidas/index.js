import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

const fill = (value, member) => String(value ?? '')
  .replace(/\{user\}/g, `<@${member.id}>`)
  .replace(/\{username\}/g, member.user.username)
  .replace(/\{server\}/g, member.guild.name)
  .replace(/\{count\}/g, String(member.guild.memberCount));

export default {
  commands: [],
  events: [{
    name: Events.GuildMemberAdd,
    async execute(_client, member) {
      const { enabled, config } = await getModuleState(member.guild.id, 'bienvenidas');
      if (!enabled || !config.channelId) return;
      const channel = member.guild.channels.cache.get(config.channelId);
      if (!channel?.isTextBased()) return;
      await channel.send({
        content: fill(config.message, member),
        allowedMentions: { users: [member.id] },
      }).catch((e) => logger.warn('Bienvenida no enviada:', e.message));
    },
  }],
};
