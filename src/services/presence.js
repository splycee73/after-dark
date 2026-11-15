import { ActivityType } from 'discord.js';
import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';

export const ACTIVITY_TYPES = {
  Playing: ActivityType.Playing, Streaming: ActivityType.Streaming, Listening: ActivityType.Listening,
  Watching: ActivityType.Watching, Competing: ActivityType.Competing, Custom: ActivityType.Custom,
};
export const STATUSES = ['online', 'idle', 'dnd', 'invisible'];

let idx = 0;

export async function applyPresence(client) {
  const { rows: [cfg] } = await query('SELECT * FROM bot_presence WHERE id = 1');
  if (!cfg || !client.isReady() || !cfg.activities.length) return 30;
  const a = cfg.activities[idx++ % cfg.activities.length];
  const members = client.guilds.cache.reduce((n, g) => n + g.memberCount, 0);
  const text = String(a.text)
    .replaceAll('{miembros}', members.toLocaleString('es-ES'))
    .replaceAll('{servidores}', String(client.guilds.cache.size));
  const activity = a.type === 'Custom'
    ? { name: 'Custom Status', type: ActivityType.Custom, state: text }
    : { name: text, type: ACTIVITY_TYPES[a.type] ?? ActivityType.Watching };
  client.user.setPresence({ status: cfg.status, activities: [activity] });
  return cfg.interval_seconds;
}

// Relee la configuración en cada vuelta: los cambios del dashboard se aplican solos.
export function startPresence(client) {
  const loop = async () => {
    let wait = 30;
    try { wait = await applyPresence(client); } catch (e) { logger.error('Presencia:', e); }
    setTimeout(loop, wait * 1000);
  };
  loop();
}
