import { Router } from 'express';
import { ChannelType } from 'discord.js';
import { wrap, names } from './extras.js';
import { EconomyError } from '../services/economy.js';
import { audit, getModuleState } from '../services/guilds.js';
import * as tickets from '../services/tickets.js';
import { listCases } from '../services/moderation.js';
import * as wl from '../services/whitelist.js';
import * as inv from '../services/invites.js';
import { sendWelcome } from '../services/welcome.js';
import * as ar from '../services/autoroles.js';
import * as sg from '../services/suggestions.js';
import * as emb from '../services/embeds.js';
import { aiConfigured, usageToday } from '../services/ai.js';
import { runManga, runAnime18 } from '../services/feeds.js';

const SNOW = /^\d{17,20}$/;

// CRUD estándar sobre una entidad (services/entity.js)
function crud(r, path, ent, auditName) {
  r.get(path, wrap(async (req, res) => res.json(await ent.list(req.guild.id))));
  r.post(path, wrap(async (req, res) => {
    const row = await ent.create(req.guild.id, req.body, req.guild);
    await audit(req.guild.id, req.session.user.id, `${auditName}.create`, { id: row.id });
    res.json(row);
  }));
  r.put(`${path}/:itemId`, wrap(async (req, res) => {
    const row = await ent.update(req.guild.id, req.params.itemId, req.body, req.guild);
    await audit(req.guild.id, req.session.user.id, `${auditName}.update`, { id: row.id });
    res.json(row);
  }));
  r.delete(`${path}/:itemId`, wrap(async (req, res) => {
    await ent.remove(req.guild.id, req.params.itemId);
    await audit(req.guild.id, req.session.user.id, `${auditName}.delete`, { id: req.params.itemId });
    res.json({ ok: true });
  }));
}

export function createGuildExtras2(client) {
  const r = Router({ mergeParams: true });

  r.get('/categories', (req, res) => res.json(
    req.guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name }))));

  // --- Tickets ---
  crud(r, '/tickets/categories', tickets.categories, 'tickets.category');
  r.post('/tickets/panel', wrap(async (req, res) => {
    await tickets.sendPanel(req.guild);
    await audit(req.guild.id, req.session.user.id, 'tickets.panel', {});
    res.json({ ok: true });
  }));
  r.get('/tickets/list', wrap(async (req, res) => {
    const rows = await tickets.recentTickets(req.guild.id, 25);
    const m = await names(req.guild, rows.map((x) => x.ownerId));
    res.json(rows.map((x) => ({ ...x, ownerName: m.get(x.ownerId)?.displayName ?? x.ownerId })));
  }));
  r.get('/tickets/:tid/transcript', wrap(async (req, res) => {
    const t = await tickets.getTranscript(req.guild.id, req.params.tid);
    if (!t) return res.status(404).json({ error: 'Sin transcripción' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${t.number}.html"`);
    res.send(t.transcript);
  }));

  // --- Moderación ---
  r.get('/moderation/cases', wrap(async (req, res) => {
    const rows = await listCases(req.guild.id, { limit: 30 });
    const m = await names(req.guild, rows.flatMap((x) => [x.userId]));
    res.json(rows.map((x) => ({ ...x, userName: m.get(x.userId)?.displayName ?? x.userId })));
  }));

  // --- Whitelist ---
  r.get('/whitelist', wrap(async (req, res) => {
    const rows = await wl.listEntries(req.guild.id);
    const m = await names(req.guild, rows.map((x) => x.userId));
    res.json(rows.map((x) => ({ ...x, name: m.get(x.userId)?.displayName ?? '' })));
  }));
  r.post('/whitelist', wrap(async (req, res) => {
    const { userId, note } = req.body ?? {};
    if (!SNOW.test(userId ?? '')) throw new EconomyError('ID de usuario inválido.');
    await wl.addEntry(req.guild, userId, req.session.user.id, String(note ?? ''));
    await audit(req.guild.id, req.session.user.id, 'whitelist.add', { userId });
    res.json({ ok: true });
  }));
  r.delete('/whitelist/:userId', wrap(async (req, res) => {
    if (!SNOW.test(req.params.userId)) throw new EconomyError('ID inválido.');
    await wl.removeEntry(req.guild, req.params.userId);
    await audit(req.guild.id, req.session.user.id, 'whitelist.remove', { userId: req.params.userId });
    res.json({ ok: true });
  }));

  // --- Invites ---
  r.get('/invites/top', wrap(async (req, res) => {
    const rows = await inv.top(req.guild.id, 15);
    const m = await names(req.guild, rows.map((x) => x.inviterId));
    res.json(rows.map((x) => ({ ...x, name: m.get(x.inviterId)?.displayName ?? x.inviterId })));
  }));
  r.get('/invites/recent', wrap(async (req, res) => {
    const rows = await inv.recent(req.guild.id, 25);
    const m = await names(req.guild, rows.flatMap((x) => [x.memberId, x.inviterId].filter(Boolean)));
    res.json(rows.map((x) => ({ ...x, memberName: m.get(x.memberId)?.displayName ?? x.memberId, inviterName: x.inviterId ? (m.get(x.inviterId)?.displayName ?? x.inviterId) : '—' })));
  }));
  crud(r, '/invites/rewards', inv.rewards, 'invites.reward');

  // --- Probar bienvenida / despedida ---
  r.post('/modules/:module/test', wrap(async (req, res) => {
    const { module } = req.params;
    if (!['bienvenidas', 'despedidas'].includes(module)) throw new EconomyError('Este módulo no tiene prueba.');
    const { config } = await getModuleState(req.guild.id, module);
    if (!config.channelId) throw new EconomyError('Guarda primero un canal para el mensaje.');
    const member = await req.guild.members.fetch(req.session.user.id).catch(() => null);
    if (!member) throw new EconomyError('Debes estar en el servidor para probarlo.');
    await sendWelcome(module, config, member, { inviterId: member.id, inviterInvites: 0 })
      .catch(() => { throw new EconomyError('No pude enviar el mensaje. Revisa los permisos del bot en ese canal.'); });
    res.json({ ok: true });
  }));

  // --- Autoroles ---
  crud(r, '/autoroles/panels', ar.panels, 'autoroles.panel');
  r.post('/autoroles/panels/:itemId/send', wrap(async (req, res) => {
    await ar.sendPanel(req.guild, req.params.itemId);
    await audit(req.guild.id, req.session.user.id, 'autoroles.send', { id: req.params.itemId });
    res.json({ ok: true });
  }));

  // --- Sugerencias ---
  r.get('/suggestions', wrap(async (req, res) => {
    const rows = await sg.listSuggestions(req.guild.id);
    const m = await names(req.guild, rows.map((x) => x.userId));
    res.json(rows.map((x) => ({ ...x, name: m.get(x.userId)?.displayName ?? x.userId })));
  }));
  r.post('/suggestions/:num/decide', wrap(async (req, res) => {
    const { status, reason } = req.body ?? {};
    if (!['approved', 'rejected'].includes(status) || !/^\d+$/.test(req.params.num)) throw new EconomyError('Datos inválidos.');
    await sg.decide({ client, guild: req.guild, number: Number(req.params.num), status, by: req.session.user.id, reason: String(reason ?? '') });
    await audit(req.guild.id, req.session.user.id, `suggestions.${status}`, { number: req.params.num });
    res.json({ ok: true });
  }));

  // --- Embeds ---
  r.get('/embeds/templates', wrap(async (req, res) => res.json(await emb.listTemplates(req.guild.id))));
  r.post('/embeds/templates', wrap(async (req, res) => {
    await emb.saveTemplate(req.guild.id, req.body?.name, req.body?.data ?? {});
    res.json({ ok: true });
  }));
  r.delete('/embeds/templates/:tid', wrap(async (req, res) => { await emb.deleteTemplate(req.guild.id, req.params.tid); res.json({ ok: true }); }));
  r.post('/embeds/send', wrap(async (req, res) => {
    await emb.sendEmbed(req.guild, req.body?.channelId, req.body?.data ?? {});
    await audit(req.guild.id, req.session.user.id, 'embeds.send', { channelId: req.body?.channelId });
    res.json({ ok: true });
  }));

  // --- IA / Manga / Anime +18 ---
  r.get('/ai/status', wrap(async (req, res) => res.json({ configured: aiConfigured(), usage: await usageToday(req.guild.id) })));
  r.post('/manga/run', wrap(async (req, res) => { res.json({ posted: await runManga(client, req.guild, { force: true }) }); }));
  r.post('/anime18/run', wrap(async (req, res) => { res.json({ posted: await runAnime18(client, req.guild, { force: true }) }); }));

  return r;
}
