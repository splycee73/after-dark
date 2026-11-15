// Catálogo central de módulos. Un módulo solo se marca implementado cuando tiene lógica funcional.
export const MODULES = [
  { key: 'stats', name: 'Stats', icon: '📊', stage: 1, implemented: true },
  { key: 'personalizacion', name: 'Personalización', icon: '🎨', stage: 1, implemented: true },
  { key: 'economia', name: 'Economía', icon: '💰', stage: 2, implemented: true },
  { key: 'store', name: 'Store', icon: '🛒', stage: 2, implemented: true },
  { key: 'contador', name: 'Contador', icon: '🔢', stage: 2, implemented: true },
  { key: 'tickets', name: 'Tickets', icon: '🎫', stage: 3, implemented: true },
  { key: 'logs', name: 'Logs', icon: '📜', stage: 3, implemented: true },
  { key: 'alertas', name: 'Alertas', icon: '🔔', stage: 3, implemented: true },
  { key: 'moderacion', name: 'Moderación', icon: '🛡️', stage: 4, implemented: false },
  { key: 'whitelist', name: 'Whitelist', icon: '✅', stage: 4, implemented: false },
  { key: 'invites', name: 'Invites', icon: '📨', stage: 4, implemented: false },
  { key: 'bienvenidas', name: 'Bienvenidas', icon: '👋', stage: 4, implemented: true },
  { key: 'despedidas', name: 'Despedidas', icon: '🚪', stage: 4, implemented: true },
  { key: 'autoroles', name: 'Autoroles', icon: '🏷️', stage: 4, implemented: false },
  { key: 'autorol_bienvenida', name: 'Autorol de bienvenida', icon: '🎁', stage: 4, implemented: true },
  { key: 'sugerencias', name: 'Sugerencias', icon: '💡', stage: 4, implemented: false },
  { key: 'embeds', name: 'Embeds', icon: '🧩', stage: 5, implemented: false },
  { key: 'ia', name: 'IA', icon: '🤖', stage: 5, implemented: false },
  { key: 'manga', name: 'Manga', icon: '📚', stage: 6, implemented: false },
  { key: 'anime18', name: 'Anime +18', icon: '🔞', stage: 6, implemented: false },
];
export const MODULE_KEYS = MODULES.map((m) => m.key);
