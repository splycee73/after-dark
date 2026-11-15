// Fuente única de configuración por módulo: API valida y dashboard genera sus formularios.
const int = (key, label, def, min, max, extra = {}) => ({ key, label, type: 'int', def, min, max, ...extra });
const bool = (key, label, def, extra = {}) => ({ key, label, type: 'bool', def, ...extra });
const str = (key, label, def, max, extra = {}) => ({ key, label, type: 'string', def, max, ...extra });
const ref = (type, key, label, extra = {}) => ({ key, label, type, def: null, ...extra });
const MAX = 1_000_000_000;

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
    str('successEmoji', 'Reacción de acierto', '✅', 16, { section: 'Mensajes' }),
    str('successMessage', 'Mensaje de acierto', '', 200),
    str('errorMessage', 'Mensaje de error · {user} {number} {expected} {start} {reason}', '❌ {user} arruinó el conteo en **{number}** ({reason}). Seguía el **{expected}**. ¡Volvemos a empezar desde **{start}**!', 300, { required: true }),
  ],
  tickets: [
    ref('channel', 'categoryId', 'Categoría donde crear tickets', { section: 'Configuración' }),
    ref('role', 'supportRoleId', 'Rol de soporte'),
  ],
  logs: [
    ref('channel', 'channelId', 'Canal donde enviar registros', { section: 'Eventos' }),
    bool('messageDelete', 'Mensajes eliminados', true),
    bool('messageUpdate', 'Mensajes editados', true),
    bool('memberAdd', 'Entradas de miembros', true),
    bool('memberRemove', 'Salidas de miembros', true),
    bool('channelCreate', 'Canales creados', true),
    bool('channelDelete', 'Canales eliminados', true),
    bool('guildBanAdd', 'Baneos', true),
  ],
  alertas: [
    ref('channel', 'channelId', 'Canal de alertas', { section: 'Anti-raid básico' }),
    int('joinWindowSeconds', 'Ventana de tiempo (segundos)', 15, 5, 300),
    int('joinThreshold', 'Entradas para alertar', 8, 2, 100),
    bool('massMentionEnabled', 'Detectar menciones masivas', true, { section: 'Menciones' }),
    int('mentionThreshold', 'Menciones para alertar', 8, 2, 100),
  ],
};

const SNOWFLAKE = /^\\d{17,20}$/;
export function normalizeConfig(key, input, guild) {
  const schema = SCHEMAS[key];
  if (!schema) return input ?? {};
  const out = {};
  for (const f of schema) {
    let v = input?.[f.key];
    if (f.type === 'int') {
      v = v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(f.max, Math.max(f.min, Math.trunc(Number(v)))) : f.def;
    } else if (f.type === 'bool') v = typeof v === 'boolean' ? v : f.def;
    else if (f.type === 'string') {
      v = typeof v === 'string' ? v.trim().slice(0, f.max) : f.def;
      if (!v && f.required) v = f.def;
    } else {
      const coll = f.type === 'channel' ? guild?.channels : guild?.roles;
      v = typeof v === 'string' && SNOWFLAKE.test(v) && (!guild || coll.cache.has(v)) ? v : null;
    }
    out[f.key] = v;
  }
  if (key === 'economia' && out.workMin > out.workMax) [out.workMin, out.workMax] = [out.workMax, out.workMin];
  return out;
}
