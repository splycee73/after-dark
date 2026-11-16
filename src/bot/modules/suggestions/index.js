import { Events } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { EconomyError } from '../../../services/economy.js';
import { createSuggestion, vote, decide, canReview } from '../../../services/suggestions.js';
import { logger } from '../../../lib/logger.js';

const M = 'sugerencias';

const suggest = defineCommand({
  name: 'suggest', description: 'Envía una sugerencia al servidor', module: M, aliases: ['sugerir'],
  options: [{ name: 'texto', type: 'string', description: 'Tu sugerencia', required: true }],
  async run(ctx) {
    const s = await createSuggestion({ guild: ctx.guild, user: ctx.user, content: ctx.args.texto });
    await ctx.reply({ embeds: [embed('💡 Sugerencia enviada', `Tu sugerencia **#${s.number}** fue publicada.`)], ephemeral: true });
  },
});

const decideCmd = (name, status, label) => defineCommand({
  name, description: `${label} una sugerencia`, module: M,
  options: [{ name: 'numero', type: 'int', description: 'Número de la sugerencia', required: true }, { name: 'razon', type: 'string', description: 'Motivo' }],
  async run(ctx) {
    const { config } = await getModuleState(ctx.guild.id, M);
    if (!canReview(ctx.member, config)) throw new EconomyError('No tienes permiso para revisar sugerencias.');
    await decide({ client: ctx.client, guild: ctx.guild, number: ctx.args.numero, status, by: ctx.user.id, reason: ctx.args.razon });
    await ctx.reply({ embeds: [embed(status === 'approved' ? '✅ Sugerencia aprobada' : '❌ Sugerencia rechazada', `Sugerencia **#${ctx.args.numero}** actualizada.`)], ephemeral: true });
  },
});

export default {
  commands: [suggest, decideCmd('suggestion-approve', 'approved', 'Aprueba'), decideCmd('suggestion-reject', 'rejected', 'Rechaza')],
  events: [{
    name: Events.InteractionCreate,
    async execute(_c, i) {
      if (!i.isButton() || !i.guild || !['sg:up', 'sg:down'].includes(i.customId)) return;
      try {
        const { enabled } = await getModuleState(i.guild.id, M);
        if (!enabled) return await i.reply({ content: 'Las sugerencias están desactivadas.', ephemeral: true });
        await vote(i, i.customId === 'sg:up' ? 1 : -1);
      } catch (e) { logger.error('Sugerencias:', e); await i.reply({ content: '❌ Ocurrió un error.', ephemeral: true }).catch(() => {}); }
    },
  }],
};
