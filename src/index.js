import { config } from './config.js';
import { logger } from './lib/logger.js';
import { migrate } from './db/migrate.js';
import { createBot } from './bot/client.js';
import { createServer } from './web/server.js';

process.on('unhandledRejection', (e) => logger.error('unhandledRejection:', e));
process.on('uncaughtException', (e) => logger.error('uncaughtException:', e));

await migrate();
const client = await createBot();
// Primero la web (Render necesita ver el puerto abierto), luego el login del bot.
createServer(client).listen(config.port, () => logger.info(`Dashboard en ${config.baseUrl} (puerto ${config.port})`));
await client.login(config.discord.token);
