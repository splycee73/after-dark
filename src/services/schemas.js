// Fuente única de verdad de la configuración por módulo: la usan el bot, la API (validación) y el dashboard (formularios).
import { LOG_EVENTS } from './log-events.js';

const base = (type, key, label, def, extra) => ({ key, label, type, def, ...extra });
const int = (key, label, def, min, max, extra = {}) => base('int', key, label, def, { min, max, ...extra });
const bool = (key, label, def, extra = {}) => base('bool', key, label, def, extra);
const str = (key, label, def, max, extra = {}) => base('string', key, label, def, { max, ...extra });
const ref = (type, key, label, extra = {}) => base(type, key, label, null, extra);
const roles = (key, label, extra = {}) => base('roles', key, label, [], { max: 10, ...extra });
const color = (key, label, def = '#8b5cf6', extra = {}) => base('color', key, label, def, extra);
const url = (key, label, extra = {}) => base('url', key, label, '', { max: 300, ...extra });
const sel = (key, label, def, options, extra = {}) => base('select', key, label, def, { options, ...extra });
const MAX = 1_000_000_000;
const VARS = '{user} {username} {server} {memberCount} {inviter} {inviterInvites}';

const messageFields = (kind) => [
  ref('channel', 'channelId', 'Canal', { section: 'General' }),
  str('message', `Texto del mensaje · variables: ${VARS}`, kind === 'bienvenidas' ? '👋 {user}' : '', 500),
  bool('useEmbed', 'Enviar como embed', true, { section: 'Embed' }),
  str('embedTitle', 'Título', kind === 'bienvenidas' ? '¡Bienvenido a {server}!' : 'Hasta pronto', 256),
  str('embedDescription', 'Descripción', kind === 'bienvenidas'
    ? 'Bienvenido a **{server}**, {user}. Eres el miembro **#{memberCount}**. Te invitó {inviter}.'
    : '**{username}** salió de **{server}**. Ahora somos **{memberCount}** miembros.', 1000),
  color('embedColor', 'Color'),
  url('imageUrl', 'Imagen grande (URL https)'),
  bool('thumbnailAvatar', 'Mostrar el avatar como miniatura', true),
  str('footer', 'Pie de página', '', 100),
  ...(kind === 'bienvenidas' ? [
    bool('dmEnabled', 'Enviar también por mensaje directo', false, { section: 'Mensaje directo' }),
    str('dmMessage', 'Texto del mensaje directo', '¡Bienvenido a {server}!', 500),
  ] : []),
];

export const SCHEMAS = {
  economia: [
    str('currencySymbol', 'Símbolo de la moneda', '💰', 16, { required: true, section: 'Moneda' }),
    str('currencyName', 'Nombre de la moneda', 'monedas', 32, { required: true }),
    int('startBalance', 'Saldo inicial de cada usuario', 0, 0, MAX),
    int('workMin', 'Pago mínimo', 50, 1, MAX, { section: '.work' }),
    int('workMax', 'Pago máximo', 150, 1, MAX),
    int('workCooldown', 'Espera (segundos)', 3600, 0, 604800),
    int('dailyAmount', 'Recompensa', 500, 1, MAX, { section: '.daily' }),
    int('dailyCooldown', 'Espera (segundos)', 86400, 0, 604800),
    int('weeklyAmount', 'Recompensa', 3000, 1, MAX, { section: '.weekly' }),
    int('weeklyCooldown', 'Espera (segundos)', 604800, 0, 2592000),
    bool('robEnabled', 'Permitir robos', true, { section: '.rob' }),
    int('robChance', 'Probabilidad de éxito (%)', 40, 0, 100),
    int('robCooldown', 'Espera (segundos)', 7200, 0, 604800),
    int('robMaxPercent', 'Máximo robable de la víctima (%)', 30, 1, 100),
    int('robFinePercent', 'Multa si fallas (% de tu saldo)', 20, 0, 100),
    int('robMinVictim', 'Saldo mínimo de la víctima', 100, 0, MAX),
  ],
  store: [],
  contador: [
    ref('channel', 'channelId', 'Canal del contador', { section: 'General' }),
    int('startNumber', 'Número inicial', 1, 0, MAX),
    ref('role', 'allowedRoleId', 'Rol permitido (vacío = todos)'),
    bool('allowSameUser', 'Permitir que la misma persona cuente dos veces seguidas', false),
    bool('deleteInvalid', 'Borrar mensajes que no sean números', false),
    bool('resetOnError', 'Reiniciar el contador al fallar', true),
    str('successEmoji', 'Reacción de acierto (vacío = ninguna)', '✅', 16, { section: 'Mensajes' }),
    str('successMessage', 'Mensaje de acierto (vacío = solo reacción)', '', 200),
    str('errorMessage', 'Mensaje de error · {user} {number} {expected} {start} {reason}',
      '❌ {user} arruinó el conteo en **{number}** ({reason}). Seguía el **{expected}**. ¡Volvemos a empezar desde **{start}**!', 300, { required: true }),
  ],
  tickets: [
    ref('channel', 'panelChannelId', 'Canal del panel de tickets', { section: 'Panel' }),
    str('panelTitle', 'Título del panel', '🎫 Centro de soporte', 256, { required: true }),
    str('panelDescription', 'Descripción del panel', 'Pulsa el botón de la categoría que necesites para abrir un ticket.', 1000, { required: true }),
    color('panelColor', 'Color del panel'),
    roles('supportRoleIds', 'Roles de soporte (ven todos los tickets)', { section: 'Soporte' }),
    ref('channel', 'transcriptChannelId', 'Canal de transcripciones y registros'),
    int('maxPerUser', 'Tickets abiertos por usuario (0 = sin límite)', 1, 0, 20),
    bool('claimEnabled', 'Permitir reclamar tickets', true),
    bool('ratingEnabled', 'Pedir valoración al cerrar (por mensaje directo)', true),
    bool('dmTranscript', 'Enviar la transcripción al usuario por mensaje directo', true),
    str('welcomeMessage', 'Mensaje de bienvenida por defecto · {user} {category}', 'Hola {user}, el equipo de soporte te atenderá en breve.', 500, { section: 'Mensajes' }),
    str('closeMessage', 'Mensaje de cierre · {closer} {reason}', 'Este ticket fue cerrado por {closer}. Motivo: {reason}', 300),
  ],
  logs: [
    ref('channel', 'channelId', 'Canal general de registros', { section: 'General' }),
    ...LOG_EVENTS.flatMap(([ev, label], i) => [
      bool(`ev_${ev}`, `Registrar: ${label}`, true, i === 0 ? { section: 'Eventos' } : {}),
      ref('channel', `ch_${ev}`, `Canal propio para "${label}" (vacío = general)`),
    ]),
  ],
  alertas: [
    ref('channel', 'channelId', 'Canal de alertas', { section: 'General' }),
    ref('role', 'pingRoleId', 'Rol a mencionar en las alertas'),
    bool('raidEnabled', 'Detectar raids (muchas entradas seguidas)', true, { section: 'Detección' }),
    int('raidJoins', 'Entradas necesarias para alertar', 8, 3, 100),
    int('raidWindow', 'En cuántos segundos', 20, 5, 300),
    bool('newAccountEnabled', 'Avisar de cuentas nuevas', true),
    int('newAccountDays', 'Antigüedad mínima de la cuenta (días)', 7, 1, 365),
    bool('adminRoleEnabled', 'Avisar cuando se da un rol con permiso de administrador', true),
    bool('channelDeleteEnabled', 'Avisar cuando se elimina un canal', true),
    bool('bulkDeleteEnabled', 'Avisar de borrados masivos de mensajes', true),
  ],
  moderacion: [
    bool('dmOnAction', 'Avisar por mensaje directo al sancionado', true, { section: 'Sanciones' }),
    int('warnsForTimeout', 'Avisos para aplicar timeout automático (0 = desactivado)', 3, 0, 20),
    int('timeoutMinutes', 'Duración del timeout automático (minutos)', 60, 1, 40320),
    bool('automodEnabled', 'Activar automoderación', false, { section: 'Automoderación' }),
    bool('antiInvites', 'Bloquear invitaciones de Discord', true),
    bool('antiLinks', 'Bloquear enlaces', false),
    bool('antiSpam', 'Bloquear spam (mensajes muy seguidos)', true),
    int('spamMessages', 'Mensajes máximos', 6, 3, 30),
    int('spamSeconds', 'En cuántos segundos', 5, 2, 60),
    int('maxMentions', 'Máximo de menciones por mensaje (0 = sin límite)', 5, 0, 50),
    str('badWords', 'Palabras prohibidas (separadas por coma)', '', 1000),
    roles('exemptRoleIds', 'Roles exentos de la automoderación'),
  ],
  whitelist: [
    ref('role', 'whitelistRoleId', 'Rol que se entrega a los usuarios de la whitelist', { section: 'General' }),
    bool('kickNonWhitelisted', 'Expulsar al entrar a quien no esté en la whitelist', false),
    str('kickMessage', 'Mensaje enviado antes de expulsar', 'Este servidor es privado y no estás en la whitelist.', 300),
    bool('bypassBots', 'No expulsar bots', true),
    bool('bypassAutomod', 'Los usuarios de la whitelist ignoran la automoderación', true),
  ],
  invites: [int('fakeAccountDays', 'Cuentas con menos de X días cuentan como falsas', 3, 0, 365, { section: 'General' })],
  bienvenidas: messageFields('bienvenidas'),
  despedidas: messageFields('despedidas'),
  autoroles: [],
  autorol_bienvenida: [
    roles('humanRoleIds', 'Roles para los miembros nuevos', { section: 'General' }),
    ref('role', 'botRoleId', 'Rol para los bots nuevos'),
    int('delaySeconds', 'Esperar antes de entregarlos (segundos)', 0, 0, 3600),
  ],
  sugerencias: [
    ref('channel', 'channelId', 'Canal de sugerencias', { section: 'General' }),
    ref('role', 'reviewRoleId', 'Rol que puede aprobar o rechazar'),
    int('cooldown', 'Espera entre sugerencias (segundos)', 300, 0, 86400),
    int('minLength', 'Longitud mínima', 10, 1, 500),
    int('maxLength', 'Longitud máxima', 1000, 20, 1800),
    bool('anonymous', 'Sugerencias anónimas', false),
    bool('dmOnDecision', 'Avisar al autor por mensaje directo al decidir', true),
  ],
  embeds: [],
  ia: [
    ref('channel', 'channelId', 'Canal donde responde la IA', { section: 'General' }),
    str('model', 'Modelo (si no coincide con tu proveedor se usa uno por defecto)', 'claude-haiku-5-5', 60, { required: true }),
    str('systemPrompt', 'Personalidad e instrucciones', 'Eres el asistente de AFTER DARK, un servidor de Discord. Respondes de forma amable, breve y natural, en el idioma del usuario.', 1500, { required: true }),
    int('maxTokens', 'Longitud máxima de la respuesta (tokens)', 400, 50, 1500),
    int('memoryMessages', 'Mensajes anteriores que recuerda', 8, 0, 20, { section: 'Límites' }),
    int('cooldown', 'Espera entre mensajes por usuario (segundos)', 5, 0, 300),
    int('dailyLimit', 'Mensajes diarios por usuario (0 = sin límite)', 50, 0, 1000),
    ref('role', 'allowedRoleId', 'Rol necesario para usar la IA (vacío = todos)'),
  ],
  manga: [
    ref('channel', 'channelId', 'Canal de publicación', { section: 'General' }),
    int('intervalMinutes', 'Revisar novedades cada (minutos)', 30, 10, 1440),
    int('maxPerRun', 'Publicaciones máximas por revisión', 3, 1, 10),
    str('languages', 'Idiomas de traducción (códigos separados por coma)', 'es', 40, { section: 'MangaDex' }),
    bool('useMangadex', 'Usar MangaDex como fuente', true),
    bool('allowSuggestive', 'Incluir contenido "sugerente"', false),
    str('genres', 'Solo géneros (separados por coma, vacío = todos)', '', 200),
    str('excludeGenres', 'Excluir géneros (separados por coma)', '', 200),
    str('rssUrls', 'Fuentes RSS adicionales (una URL https por línea)', '', 800, { section: 'RSS' }),
    ref('role', 'pingRoleId', 'Rol a mencionar en cada publicación', { section: 'Embed' }),
    color('embedColor', 'Color del embed'),
    bool('showDescription', 'Mostrar sinopsis', true),
  ],
  anime18: [
    bool('ageConfirmed', 'Confirmo que el canal es NSFW (restringido por edad) y que solo tiene acceso gente mayor de 18 años', false, { section: 'Acceso' }),
    ref('channel', 'channelId', 'Canal NSFW de publicación'),
    bool('autoPost', 'Publicar automáticamente', false),
    int('intervalMinutes', 'Cada (minutos)', 60, 10, 1440),
    int('postsPerRun', 'Publicaciones por vez', 1, 1, 3),
    sel('rating', 'Clasificación', 'explicit', [['explicit', 'Explícito'], ['questionable', 'Sugerente']], { section: 'Filtros' }),
    str('tag', 'Etiqueta opcional (una sola, ej: original)', '', 40),
    str('excludedTags', 'Etiquetas excluidas (separadas por coma)', 'guro, scat, rape', 300),
    color('embedColor', 'Color del embed', '#ec4899'),
  ],
};

const SNOWFLAKE = /^\d{17,20}$/;

export function normalizeConfig(key, input, guild) {
  const schema = SCHEMAS[key];
  if (!schema) return input ?? {};
  const out = {};
  for (const f of schema) {
    let v = input?.[f.key];
    switch (f.type) {
      case 'int':
        v = v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))
          ? Math.min(f.max, Math.max(f.min, Math.trunc(Number(v)))) : f.def;
        break;
      case 'bool': v = typeof v === 'boolean' ? v : f.def; break;
      case 'string':
        v = typeof v === 'string' ? v.trim().slice(0, f.max) : f.def;
        if (!v && f.required) v = f.def;
        break;
      case 'color': v = /^#[0-9a-f]{6}$/i.test(v ?? '') ? v : f.def; break;
      case 'url': v = typeof v === 'string' && /^https:\/\/\S+$/.test(v.trim()) ? v.trim().slice(0, f.max) : ''; break;
      case 'select': v = f.options.some(([o]) => o === v) ? v : f.def; break;
      case 'roles':
        v = Array.isArray(v) ? v.filter((r) => SNOWFLAKE.test(r) && (!guild || guild.roles.cache.has(r))).slice(0, f.max) : [];
        break;
      default: {
        const coll = f.type === 'channel' ? guild?.channels : guild?.roles;
        v = typeof v === 'string' && SNOWFLAKE.test(v) && (!guild || coll.cache.has(v)) ? v : null;
      }
    }
    out[f.key] = v;
  }
  if (key === 'economia' && out.workMin > out.workMax) [out.workMin, out.workMax] = [out.workMax, out.workMin];
  return out;
}
