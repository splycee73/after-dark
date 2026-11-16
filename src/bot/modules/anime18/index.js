import { Events } from 'discord.js';
import { defineCommand } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { EconomyError } from '../../../services/economy.js';
import { fetchAnime18, anime18Embed, assertAnime18Channel, dueGuilds, runAnime18, touchRun } from '../../../services/feeds.js';
import { logger } from '../../../lib/logger.js';

const cmd = defineCommand({
  name: 'anime18', description: 'Imagen anime +18 (solo en canales NSFW)', module: 'anime18', defer: true,
  options: [{ name: 'etiqueta', type: 'string', description: 'Etiqueta opcional' }],
  async run(ctx) {
    const { config } = await getModuleState(ctx.guild.id, 'anime18');
    assertAnime18Channel(ctx.guild, config, ctx.channel);
    const post = await fetchAnime18(config, ctx.args.etiqueta ?? '');
    if (!post) throw new EconomyError('No encontré resultados con esos filtros. Prueba otra etiqueta.');
    await ctx.reply({ embeds: [anime18Embed(post, config)] });
  },
});

export default {
  commands: [cmd],
  events: [{
    name: Events.ClientReady, once: true,
    async execute(client) {
      let busy = false;
      setInterval(async () => {
        if (busy) return; busy = true;
        try {
          for (const g of await dueGuilds(client, 'anime18')) {
            await runAnime18(client, g).catch(async (e) => { logger.warn(`Anime18 ${g.name}: ${e.message}`); await touchRun(g.id, 'anime18'); });
          }
        } catch (e) { logger.error('Scheduler anime18:', e); } finally { busy = false; }
      }, 60_000);
    },
  }],
};
