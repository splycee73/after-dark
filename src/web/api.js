import { Router } from 'express';
import { ChannelType } from 'discord.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { MODULE_KEYS } from '../modules.js';
import { getModules, setModule, audit } from '../services/guilds.js';
import { normalizeConfig } from '../services/schemas.js';
import { createGuildExtras, wrap } from './extras.js';
import { createGuildExtras2 } from './extras2.js';
import { ACTIVITY_TYPES, STATUSES, applyPresence } from '../services/presence.js';

export function createApi(client) {
  const r = Router();
  const isOwner = (u) => config.ownerIds.includes(u.id);

  r.use((req, res, next) => (req.session.user ? next() : res.status(401).json({ error: 'No autenticado' })));

  r.get('/me', (req, res) => {
    const u = req.session.user;
    res.json({ id: u.id, username: u.username, avatar: u.avatar, isOwner: isOwner(u) });
  });

  r.get('/guilds', (req, res) => {
    res.json(req.session.user.guilds.map((g) => ({
      ...g, botPresent: client.guilds.cache.has(g.id),
      inviteUrl: `https://discord.com/oauth2/authorize?client_id=${config.discord.clientId}&scope=bot+applications.commands&permissions=8&guild_id=${g.id}`,
    })));
  });

  // Todas las rutas /guilds/:id/* exigen permiso del usuario Y que el bot esté en el servidor.
  r.use('/guilds/:id', (req, res, next) => {
    const allowed = req.session.user.guilds.some((g) => g.id === req.params.id);
    const guild = client.guilds.cache.get(req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Sin permisos en este servidor' });
    if (!guild) return res.status(404).json({ error: 'El bot no está en este servidor' });
    req.guild = guild;
    next();
  });

  r.use('/guilds/:id', createGuildExtras());
  r.use('/guilds/:id', createGuildExtras2(client));

  r.get('/guilds/:id', async (req, res) => {
    const g = req.guild;
    res.json({
      id: g.id, name: g.name, icon: g.icon, memberCount: g.memberCount,
      channels: g.channels.cache.size, roles: g.roles.cache.size,
      modules: await getModules(g.id),
    });
  });

  r.get('/guilds/:id/channels', (req, res) => res.json(
    req.guild.channels.cache
      .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
      .map((c) => ({ id: c.id, name: c.name, nsfw: c.nsfw })),
  ));

  r.get('/guilds/:id/roles', (req, res) => {
    const bot = req.guild.members.me;
    const roles = req.guild.roles.cache.filter((x) => x.id !== req.guild.id && !x.managed);
    const basic = roles.map((x) => ({ id: x.id, name: x.name, color: x.hexColor }));
    const assignableRole = roles.filter((x) => bot && x.editable && !x.permissions.has([
      PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ManageMessages,
    ])).map((x) => ({ id: x.id, name: x.name, color: x.hexColor }));
    res.json(basic.map((r) => ({ ...r, assignable: assignableRole.some((a) => a.id === r.id) })));
  });

  r.put('/guilds/:id/modules/:module', wrap(async (req, res) => {
    const { module } = req.params;
    const { enabled, config: cfg } = req.body ?? {};
    if (!MODULE_KEYS.includes(module)) return res.status(404).json({ error: 'Módulo desconocido' });
    if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled debe ser booleano' });
    if (cfg !== undefined && (typeof cfg !== 'object' || cfg === null || Array.isArray(cfg) || JSON.stringify(cfg).length > 20000))
      return res.status(400).json({ error: 'config inválida o demasiado grande' });
    await setModule(req.guild.id, module, { enabled, config: cfg === undefined ? undefined : normalizeConfig(module, cfg, req.guild) }, req.session.user.id);
    res.json({ ok: true });
  }));

  // --- Presencia global (solo OWNER_IDS) ---
  const ownerOnly = (req, res, next) => (isOwner(req.session.user) ? next() : res.status(403).json({ error: 'Solo propietarios del bot' }));

  r.get('/presence', ownerOnly, async (_req, res) => {
    const { rows: [p] } = await query('SELECT interval_seconds, status, activities FROM bot_presence WHERE id=1');
    res.json({ intervalSeconds: p.interval_seconds, status: p.status, activities: p.activities, types: Object.keys(ACTIVITY_TYPES), statuses: STATUSES });
  });

  r.put('/presence', ownerOnly, async (req, res) => {
    const { intervalSeconds, status, activities } = req.body ?? {};
    const okActs = Array.isArray(activities) && activities.length >= 1 && activities.length <= 10 &&
      activities.every((a) => a && a.type in ACTIVITY_TYPES && typeof a.text === 'string' && a.text.length >= 1 && a.text.length <= 128);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 15 || intervalSeconds > 3600 || !STATUSES.includes(status) || !okActs)
      return res.status(400).json({ error: 'Datos de presencia inválidos' });
    const clean = activities.map((a) => ({ type: a.type, text: a.text }));
    await query('UPDATE bot_presence SET interval_seconds=$1, status=$2, activities=$3 WHERE id=1', [intervalSeconds, status, JSON.stringify(clean)]);
    await audit(null, req.session.user.id, 'presence.update', { intervalSeconds, status, activities: clean });
    await applyPresence(client);
    res.json({ ok: true });
  });

  r.use((err, _req, res, _next) => res.status(500).json({ error: 'Error interno' }));
  return r;
}
