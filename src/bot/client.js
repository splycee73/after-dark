import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { logger } from '../lib/logger.js';

const modulesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'modules');

export async function createBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, GatewayIntentBits.GuildInvites,
    ],
    partials: [Partials.Message, Partials.Channel],
  });
  client.commands = new Collection();

  // Cada carpeta de src/bot/modules/<x>/index.js exporta { commands: [], events: [] }.
  for (const name of fs.readdirSync(modulesDir)) {
    const file = path.join(modulesDir, name, 'index.js');
    if (!fs.existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)).default;
    for (const c of mod.commands ?? []) client.commands.set(c.data.name, c);
    for (const e of mod.events ?? []) {
      client[e.once ? 'once' : 'on'](e.name, (...args) =>
        Promise.resolve(e.execute(client, ...args)).catch((err) => logger.error(`Evento ${e.name} (${name}):`, err)));
    }
    logger.info(`Módulo del bot cargado: ${name}`);
  }
  client.on('error', (e) => logger.error('Discord client:', e));
  return client;
}
