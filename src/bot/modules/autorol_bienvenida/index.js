import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

export default {
  commands: [],
  events: [{
    name: Events.GuildMemberAdd,
    async execute(_client, member) {
      const { enabled, config } = await getModuleState(member.guild.id, 'autorol_bienvenida');
      if (!enabled || !config.roleId) return;
      const role = member.guild.roles.cache.get(config.roleId);
      if (!role?.editable) return;
      await member.roles.add(role, 'Autorol de bienvenida').catch((e) => logger.warn('No se pudo asignar autorol:', e.message));
    },
  }],
};
