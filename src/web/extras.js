import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { audit } from '../services/guilds.js';
import { EconomyError, credit, leaderboard, recentTransactions } from '../services/economy.js';
import { listItems, createItem, updateItem, deleteItem } from '../services/store.js';
import { getCounter, setCounter } from '../services/counter.js';
import { listTickets, ticketCounts, listTicketPanels, saveTicketPanel, deleteTicketPanel, getTicketPanel, getTicketById, listTicketNotes, addTicketNote } from '../services/tickets.js';
import { publishTicketPanel } from '../bot/modules/tickets/index.js';

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e instanceof EconomyError) return res.status(400).json({ error: e.message });
  logger.error('API:', e);
  res.status(500).json({ error: 'Error interno' });
});

async function names(guild, ids) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  return guild.members.fetch({ user: uniq }).catch(() => new Map());
}


function validatePanel(body, guild) {
  const b = body ?? {};
  const clean = (v, max, fallback = '') => typeof v === 'string' ? v.trim().slice(0, max) : fallback;
  const id = (v, coll) => typeof v === 'string' && /^\d{17,20}$/.test(v) && coll.cache.has(v) ? v : null;
  const fields = Array.isArray(b.formFields) ? b.formFields.slice(0, 5).map((f, i) => ({
    label: clean(f?.label, 45, `Pregunta ${i + 1}`) || `Pregunta ${i + 1}`,
    placeholder: clean(f?.placeholder, 100), style: f?.style === 'paragraph' ? 'paragraph' : 'short',
    required: f?.required !== false, maxLength: Math.min(1000, Math.max(1, Number(f?.maxLength) || 300)),
  })) : [];
  const panelChannelId = id(b.panelChannelId, guild.channels);
  if (!clean(b.name, 60) || !panelChannelId) throw new EconomyError('El panel necesita un nombre y un canal de texto válido.');
  if (b.categoryId && (!id(b.categoryId, guild.channels) || guild.channels.cache.get(b.categoryId)?.type !== 4)) throw new EconomyError('La categoría de tickets debe ser una categoría de Discord válida.');
  if (b.supportRoleId && !id(b.supportRoleId, guild.roles)) throw new EconomyError('Rol de soporte inválido.');
  const panelCategories = Array.isArray(b.panelCategories) ? b.panelCategories.slice(0, 25).map((cat, i) => {
    if (cat?.channelId && (!id(cat.channelId, guild.channels) || guild.channels.cache.get(cat.channelId)?.type !== 4))
      throw new EconomyError('Cada categoría de tickets debe apuntar a una categoría de Discord válida.');
    const channelId = cat?.channelId ? id(cat.channelId, guild.channels) : id(b.categoryId, guild.channels);
    const supportRoleIds = Array.isArray(cat?.supportRoleIds) ? cat.supportRoleIds.filter(x => id(x, guild.roles)).slice(0, 10) : (b.supportRoleId ? [b.supportRoleId] : []);
    const subcategories = Array.isArray(cat?.subcategories) ? cat.subcategories.slice(0, 25).map((sub,j) => ({
      id: clean(sub?.id, 32) || `sub-${i}-${j}`,
      label: clean(sub?.label, 80, `Subcategoría ${j+1}`) || `Subcategoría ${j+1}`,
      description: clean(sub?.description, 100),
      emoji: clean(sub?.emoji, 32) || null,
    })) : [];
    return {
      id: clean(cat?.id, 32) || `category-${i}`,
      label: clean(cat?.label, 80, `Categoría ${i+1}`) || `Categoría ${i+1}`,
      description: clean(cat?.description, 100),
      emoji: clean(cat?.emoji, 32) || null,
      channelId,
      supportRoleIds,
      subcategories,
      welcomeTitle: clean(cat?.welcomeTitle, 256),
      welcomeMessage: clean(cat?.welcomeMessage, 3000),
      formFields: Array.isArray(cat?.formFields) ? cat.formFields.slice(0,5).map((f,j)=>({
        label: clean(f?.label,45,`Pregunta ${j+1}`) || `Pregunta ${j+1}`,
        placeholder: clean(f?.placeholder,100), style: f?.style === 'paragraph' ? 'paragraph' : 'short',
        required: f?.required !== false, maxLength: Math.min(1000,Math.max(1,Number(f?.maxLength)||300)),
      })) : [],
    };
  }) : [];
  const readonlyRoleIds = Array.isArray(b.readonlyRoleIds) ? b.readonlyRoleIds.filter(x => id(x, guild.roles)).slice(0, 10) : [];
  const image = clean(b.panelImageUrl, 500);
  if (image && !/^https:\/\//i.test(image)) throw new EconomyError('La imagen del panel debe usar una URL HTTPS.');
  return {
    name: clean(b.name, 60), panelChannelId, categoryId: id(b.categoryId, guild.channels), supportRoleId: id(b.supportRoleId, guild.roles),
    panelTitle: clean(b.panelTitle, 256, 'Centro de soporte') || 'Centro de soporte',
    panelDescription: clean(b.panelDescription, 4000, 'Pulsa el botón para abrir un ticket.'),
    buttonLabel: clean(b.buttonLabel, 80, 'Crear ticket') || 'Crear ticket', buttonEmoji: clean(b.buttonEmoji, 32) || null,
    color: /^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : '#8b5cf6',
    welcomeTitle: clean(b.welcomeTitle, 256, 'Ticket abierto') || 'Ticket abierto',
    welcomeMessage: clean(b.welcomeMessage, 3000, 'Hola {user}, describe tu consulta.'),
    closeMessage: clean(b.closeMessage, 1000, 'Ticket cerrado por {user}.'), formFields: fields,
    panelCategories, readonlyRoleIds, panelImageUrl: image || null, panelFooter: clean(b.panelFooter, 200), active: b.active !== false,
  };
}

export function createGuildExtras() {
  const r = Router({ mergeParams: true });

  // --- Economía ---
  r.get('/economy/top', wrap(async (req, res) => {
    const rows = await leaderboard(req.guild.id, 10);
    const m = await names(req.guild, rows.map((x) => x.userId));
    res.json(rows.map((x) => ({ ...x, name: m.get(x.userId)?.displayName ?? x.userId })));
  }));

  r.get('/economy/transactions', wrap(async (req, res) => {
    const rows = await recentTransactions(req.guild.id, 25);
    const m = await names(req.guild, rows.map((x) => x.userId));
    res.json(rows.map((x) => ({ ...x, name: m.get(x.userId)?.displayName ?? x.userId })));
  }));

  r.post('/economy/adjust', wrap(async (req, res) => {
    const { userId, amount, note } = req.body ?? {};
    const n = Number(amount);
    if (!/^\d{17,20}$/.test(userId ?? '') || !Number.isInteger(n) || n === 0 || Math.abs(n) > 1e9) throw new EconomyError('ID de usuario o cantidad inválidos.');
    const member = await req.guild.members.fetch(userId).catch(() => null);
    if (!member) throw new EconomyError('Ese usuario no está en el servidor.');
    const bal = await credit(req.guild.id, userId, n, 'admin_adjust', { note: String(note ?? '').slice(0, 100) || `Ajuste de ${req.session.user.username}` });
    await audit(req.guild.id, req.session.user.id, 'economy.adjust', { userId, amount: n });
    res.json({ balance: bal });
  }));

  // --- Store ---
  r.get('/store/items', wrap(async (req, res) => res.json(await listItems(req.guild.id))));
  r.post('/store/items', wrap(async (req, res) => {
    const item = await createItem(req.guild.id, req.body, req.guild);
    await audit(req.guild.id, req.session.user.id, 'store.create', { id: item.id, name: item.name });
    res.json(item);
  }));
  r.put('/store/items/:itemId', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.itemId)) throw new EconomyError('ID inválido.');
    const item = await updateItem(req.guild.id, req.params.itemId, req.body, req.guild);
    await audit(req.guild.id, req.session.user.id, 'store.update', { id: item.id, name: item.name });
    res.json(item);
  }));
  r.delete('/store/items/:itemId', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.itemId)) throw new EconomyError('ID inválido.');
    await deleteItem(req.guild.id, req.params.itemId);
    await audit(req.guild.id, req.session.user.id, 'store.delete', { id: req.params.itemId });
    res.json({ ok: true });
  }));

  // --- Tickets ---
  r.get('/tickets', wrap(async (req, res) => {
    const [counts, tickets] = await Promise.all([ticketCounts(req.guild.id), listTickets(req.guild.id, 30)]);
    res.json({ counts, tickets });
  }));

  r.get('/tickets/:ticketId/notes', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.ticketId)) throw new EconomyError('ID de ticket inválido.');
    const ticket = await getTicketById(req.guild.id, req.params.ticketId);
    if (!ticket) throw new EconomyError('Ticket no encontrado.');
    res.json(await listTicketNotes(req.guild.id, ticket.id));
  }));
  r.post('/tickets/:ticketId/notes', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.ticketId)) throw new EconomyError('ID de ticket inválido.');
    const ticket = await getTicketById(req.guild.id, req.params.ticketId);
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!ticket || !content || content.length > 2000) throw new EconomyError('Ticket o nota inválidos (máximo 2000 caracteres).');
    const note = await addTicketNote(req.guild.id, ticket.id, req.session.user.id, content);
    await audit(req.guild.id, req.session.user.id, 'tickets.note.create', { ticketId: ticket.id });
    res.json(note);
  }));
  r.get('/tickets/:ticketId/transcript', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.ticketId)) throw new EconomyError('ID de ticket inválido.');
    const ticket = await getTicketById(req.guild.id, req.params.ticketId);
    if (!ticket) throw new EconomyError('Ticket no encontrado.');
    const client = req.app.get('discordClient');
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.messages) throw new EconomyError('El canal del ticket ya no está disponible.');
    const collected = []; let before;
    for (let page = 0; page < 10; page++) {
      const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      collected.push(...batch.values()); before = batch.last().id;
      if (batch.size < 100) break;
    }
    const messages = collected;
    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"\']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "\'": '&#39;' }[ch]));
    const body = [...messages].sort((a,b) => a.createdTimestamp - b.createdTimestamp).map((m) => {
      const files = [...m.attachments.values()].map((f) => `<a href="${escapeHtml(f.url)}">${escapeHtml(f.name || 'archivo')}</a>`).join(' · ');
      return `<article><header>${escapeHtml(m.author?.tag || m.author?.username || 'Usuario')} · ${new Date(m.createdTimestamp).toLocaleString('es-ES')}</header><p>${escapeHtml(m.content).replace(/\n/g, '<br>')}</p>${files ? `<p>${files}</p>` : ''}</article>`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="after-dark-ticket-${ticket.id}.html"`);
    res.send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket #${ticket.id}</title><style>body{font:15px system-ui;max-width:900px;margin:32px auto;padding:0 16px;background:#111827;color:#e5e7eb}article{padding:14px;border:1px solid #374151;border-radius:10px;margin:12px 0}header{color:#a5b4fc;font-size:13px}p{white-space:normal;overflow-wrap:anywhere}a{color:#93c5fd}</style><h1>AFTER DARK · Ticket #${ticket.id}</h1><p>Estado: ${escapeHtml(ticket.status)} · Prioridad: ${escapeHtml(ticket.priority || 'normal')}</p>${body}</html>`);
  }));

  // --- Ticket panels ---
  r.get('/tickets/panels', wrap(async (req, res) => res.json(await listTicketPanels(req.guild.id))));
  r.post('/tickets/panels', wrap(async (req, res) => {
    const saved = await saveTicketPanel(req.guild.id, validatePanel(req.body, req.guild));
    await audit(req.guild.id, req.session.user.id, 'tickets.panel.create', { panelId: saved.id });
    res.json(saved);
  }));
  r.put('/tickets/panels/:panelId', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.panelId)) throw new EconomyError('ID de panel inválido.');
    const saved = await saveTicketPanel(req.guild.id, validatePanel(req.body, req.guild), req.params.panelId);
    if (!saved) throw new EconomyError('Panel no encontrado.');
    await audit(req.guild.id, req.session.user.id, 'tickets.panel.update', { panelId: saved.id });
    res.json(saved);
  }));
  r.delete('/tickets/panels/:panelId', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.panelId)) throw new EconomyError('ID de panel inválido.');
    if (!await deleteTicketPanel(req.guild.id, req.params.panelId)) throw new EconomyError('Panel no encontrado.');
    await audit(req.guild.id, req.session.user.id, 'tickets.panel.delete', { panelId: req.params.panelId });
    res.json({ ok: true });
  }));
  r.post('/tickets/panels/:panelId/publish', wrap(async (req, res) => {
    const panel = await getTicketPanel(req.params.panelId, req.guild.id);
    if (!panel) throw new EconomyError('Panel no encontrado.');
    const client = req.app.get('discordClient');
    if (!client) throw new Error('Cliente Discord no disponible');
    const message = await publishTicketPanel(client, req.guild, panel);
    await audit(req.guild.id, req.session.user.id, 'tickets.panel.publish', { panelId: panel.id, messageId: message.id });
    res.json({ ok: true, messageId: message.id });
  }));

  // --- Contador ---
  r.get('/counter', wrap(async (req, res) => res.json(await getCounter(req.guild.id))));
  r.post('/counter/set', wrap(async (req, res) => {
    const n = Number(req.body?.next);
    if (!Number.isInteger(n) || n < 0 || n > 1e9) throw new EconomyError('Número inválido.');
    await setCounter(req.guild.id, n);
    await audit(req.guild.id, req.session.user.id, 'counter.set', { next: n });
    res.json({ ok: true });
  }));

  return r;
}
