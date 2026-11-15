import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { audit } from '../services/guilds.js';
import { EconomyError, credit, leaderboard, recentTransactions } from '../services/economy.js';
import { listItems, createItem, updateItem, deleteItem } from '../services/store.js';
import { getCounter, setCounter } from '../services/counter.js';
import { listTickets, ticketCounts } from '../services/tickets.js';

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
