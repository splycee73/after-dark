import { EventEmitter } from 'node:events';
// Bus interno: cualquier parte del código puede registrar un evento de log sin conocer al bot.
export const bus = new EventEmitter();
export const emitLog = (guildId, event, data) => bus.emit('log', { guildId, event, data });
