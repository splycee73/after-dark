import { query } from '../db/pool.js';

export async function createTicket(guildId, channelId, openerId) {
  const { rows: [row] } = await query(
    'INSERT INTO tickets (guild_id, channel_id, opener_id) VALUES ($1,$2,$3) RETURNING id, created_at',
    [guildId, channelId, openerId],
  );
  return row;
}

export async function closeTicket(channelId, actorId) {
  const { rows: [row] } = await query(
    "UPDATE tickets SET status='closed', closed_at=now(), closed_by=$2 WHERE channel_id=$1 AND status='open' RETURNING id, guild_id, opener_id",
    [channelId, actorId],
  );
  return row ?? null;
}

export async function listTickets(guildId, limit = 25) {
  const { rows } = await query(
    'SELECT id, channel_id AS "channelId", opener_id AS "openerId", status, created_at AS "createdAt", closed_at AS "closedAt" FROM tickets WHERE guild_id=$1 ORDER BY id DESC LIMIT $2',
    [guildId, limit],
  );
  return rows;
}

export async function ticketCounts(guildId) {
  const { rows: [row] } = await query(
    "SELECT COUNT(*) FILTER (WHERE status='open')::int AS open, COUNT(*)::int AS total FROM tickets WHERE guild_id=$1",
    [guildId],
  );
  return { open: row.open, total: row.total };
}
