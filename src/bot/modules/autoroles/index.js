import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { toggleRole } from '../../../services/autoroles.js';
import { logger } from '../../../lib/logger.js';

export default {
  commands: [],
  events: [{
    name: Events.InteractionCreate,
    async execute(_c, i) {
      if (!i.isButton() || !i.guild || !i.customId.startsWith('ar:')) return;
      try {
        const { enabled } = await getModuleState(i.guild.id, 'autoroles');
        if (!enabled) return await i.reply({ content: 'Los autoroles están desactivados.', ephemeral: true });
        await toggleRole(i);
      } catch (e) { logger.error('Autoroles:', e); await (i.replied ? i.followUp : i.reply).call(i, { content: '❌ No pude cambiar tus roles.', ephemeral: true }).catch(() => {}); }
    },
  }],
};
