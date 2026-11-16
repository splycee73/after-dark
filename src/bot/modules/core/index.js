import { Events, SlashCommandBuilder } from 'discord.js';
import { config } from '../../../config.js';
import { logger } from '../../../lib/logger.js';
import { upsertGuild, markGuildLeft } from '../../../services/guilds.js';
import { startPresence } from '../../../services/presence.js';

const ping = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Latencia del bot'),
  prefix: 'ping',
  async execute(interaction) { await interaction.reply(`🏓 Pong · ${interaction.client.ws.ping} ms`); },
  async executePrefix(message) { await message.reply(`🏓 Pong · ${message.client.ws.ping} ms`); },
};

export default {
  commands: [ping],
  events: [
    {
      name: Events.ClientReady, once: true,
      async execute(client) {
        logger.info(`Bot conectado como ${client.user.tag} en ${client.guilds.cache.size} servidores`);
        for (const g of client.guilds.cache.values()) await upsertGuild(g);
        await client.application.commands.set([...client.commands.values()].map((c) => c.data.toJSON()));
        startPresence(client);
      },
    },
    { name: Events.GuildCreate, execute: (_c, g) => upsertGuild(g) },
    { name: Events.GuildDelete, execute: (_c, g) => markGuildLeft(g.id) },
    {
      name: Events.InteractionCreate,
      async execute(client, i) {
        if (!i.isChatInputCommand()) return;
        const cmd = client.commands.get(i.commandName);
        if (!cmd) return;
        try { await cmd.execute(i); } catch (e) {
          logger.error(`Comando /${i.commandName}:`, e);
          const msg = { content: '❌ Ocurrió un error ejecutando el comando.', ephemeral: true };
          await (i.replied || i.deferred ? i.followUp(msg) : i.reply(msg)).catch(() => {});
        }
      },
    },
    {
      name: Events.MessageCreate,
      async execute(client, m) {
        if (m.author.bot || !m.guild || !m.content.startsWith(config.prefix)) return;
        const [name, ...args] = m.content.slice(config.prefix.length).trim().split(/\s+/);
        const n = name?.toLowerCase();
        const cmd = [...client.commands.values()].find((c) => c.prefix === n || c.aliases?.includes(n));
        if (cmd?.executePrefix) await cmd.executePrefix(m, args);
      },
    },
  ],
};
