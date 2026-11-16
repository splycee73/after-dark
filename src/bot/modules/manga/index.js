import { Events } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { EconomyError } from '../../../services/economy.js';
import { fetchMangadex, dueGuilds, runManga, touchRun } from '../../../services/feeds.js';
import { logger } from '../../../lib/logger.js';

const search = defineCommand({
  name: 'manga', description: 'Busca un manga en MangaDex', module: 'manga', defer: true,
  options: [{ name: 'titulo', type: 'string', description: 'Título a buscar', required: true }],
  async run(ctx) {
    const { config } = await getModuleState(ctx.guild.id, 'manga');
    const res = (await fetchMangadex(config, { title: ctx.args.titulo, limit: 5 }).catch(() => { throw new EconomyError('MangaDex no respondió. Inténtalo más tarde.'); })).slice(0, 5);
    if (!res.length) throw new EconomyError('No encontré resultados con esos filtros.');
    const e = embed(`📚 Resultados para "${ctx.args.titulo.slice(0, 80)}"`, res.map((m) => `**[${m.title}](${m.url})**${m.tags.length ? `\n└ ${m.tags.slice(0, 4).join(', ')}` : ''}`).join('\n\n'));
    if (res[0].cover) e.setThumbnail(res[0].cover);
    await ctx.reply({ embeds: [e] });
  },
});

export default {
  commands: [search],
  events: [{
    name: Events.ClientReady, once: true,
    async execute(client) {
      let busy = false;
      setInterval(async () => {
        if (busy) return; busy = true;
        try {
          for (const g of await dueGuilds(client, 'manga')) {
            await runManga(client, g).catch(async (e) => { logger.warn(`Manga ${g.name}: ${e.message}`); await touchRun(g.id, 'manga'); });
          }
        } catch (e) { logger.error('Scheduler manga:', e); } finally { busy = false; }
      }, 60_000);
    },
  }],
};
