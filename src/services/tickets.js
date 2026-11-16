import { query } from '../db/pool.js';

const PANEL_FIELDS = `id, guild_id AS "guildId", name, panel_channel_id AS "panelChannelId",
  category_id AS "categoryId", support_role_id AS "supportRoleId", panel_title AS "panelTitle",
  panel_description AS "panelDescription", button_label AS "buttonLabel", button_emoji AS "buttonEmoji",
  color, welcome_title AS "welcomeTitle", welcome_message AS "welcomeMessage",
  close_message AS "closeMessage", form_fields AS "formFields", message_id AS "messageId", active`;

export async function listTicketPanels(guildId) {
  const { rows } = await query(`SELECT ${PANEL_FIELDS} FROM ticket_panels WHERE guild_id=$1 ORDER BY id`, [guildId]);
  return rows;
}
export async function getTicketPanel(id, guildId) {
  const { rows: [row] } = await query(`SELECT ${PANEL_FIELDS} FROM ticket_panels WHERE id=$1 AND guild_id=$2`, [id, guildId]);
  return row ?? null;
}
export async function saveTicketPanel(guildId, input, id = null) {
  const values = [guildId, input.name, input.panelChannelId, input.categoryId, input.supportRoleId,
    input.panelTitle, input.panelDescription, input.buttonLabel, input.buttonEmoji, input.color,
    input.welcomeTitle, input.welcomeMessage, input.closeMessage, JSON.stringify(input.formFields), input.active];
  if (id) {
    const { rows: [row] } = await query(`UPDATE ticket_panels SET name=$2,panel_channel_id=$3,category_id=$4,
      support_role_id=$5,panel_title=$6,panel_description=$7,button_label=$8,button_emoji=$9,color=$10,
      welcome_title=$11,welcome_message=$12,close_message=$13,form_fields=$14::jsonb,active=$15,
      updated_at=now() WHERE guild_id=$1 AND id=$16 RETURNING id`, [...values, id]);
    if (!row) return null;
    return getTicketPanel(row.id, guildId);
  }
  const { rows: [row] } = await query(`INSERT INTO ticket_panels
    (guild_id,name,panel_channel_id,category_id,support_role_id,panel_title,panel_description,button_label,
     button_emoji,color,welcome_title,welcome_message,close_message,form_fields,active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15) RETURNING id`, values);
  return getTicketPanel(row.id, guildId);
}
export async function deleteTicketPanel(guildId, id) {
  const { rowCount } = await query('DELETE FROM ticket_panels WHERE guild_id=$1 AND id=$2', [guildId, id]);
  return rowCount > 0;
}
export async function setTicketPanelMessage(guildId, id, messageId) {
  await query('UPDATE ticket_panels SET message_id=$3,updated_at=now() WHERE guild_id=$1 AND id=$2', [guildId, id, messageId]);
}
export async function createTicket(guildId, channelId, openerId, panelId = null, formData = {}) {
  const { rows: [row] } = await query(
    'INSERT INTO tickets (guild_id, channel_id, opener_id, panel_id, form_data) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id, created_at',
    [guildId, channelId, openerId, panelId, JSON.stringify(formData)],
  );
  return row;
}
export async function getTicketById(guildId, id) {
  const { rows: [row] } = await query('SELECT id, guild_id AS "guildId", channel_id AS "channelId", opener_id AS "openerId", status, claimed_by AS "claimedBy", priority, archived_at AS "archivedAt", created_at AS "createdAt" FROM tickets WHERE guild_id=$1 AND id=$2', [guildId, id]);
  return row ?? null;
}
export async function claimTicket(channelId, userId) {
  const { rows: [row] } = await query('UPDATE tickets SET claimed_by=$2 WHERE channel_id=$1 AND status=\'open\' RETURNING id, claimed_by AS "claimedBy"', [channelId, userId]);
  return row ?? null;
}
export async function setTicketPriority(channelId, priority) {
  const { rows: [row] } = await query('UPDATE tickets SET priority=$2 WHERE channel_id=$1 AND status=\'open\' RETURNING id, priority', [channelId, priority]);
  return row ?? null;
}
export async function archiveTicket(channelId) {
  const { rows: [row] } = await query('UPDATE tickets SET archived_at=COALESCE(archived_at,now()) WHERE channel_id=$1 AND status=\'closed\' RETURNING id, archived_at AS "archivedAt"', [channelId]);
  return row ?? null;
}
export async function addTicketNote(guildId, ticketId, authorId, content) {
  const sql = 'INSERT INTO ticket_notes(ticket_id,author_id,content) SELECT id,$3,$4 FROM tickets WHERE guild_id=$1 AND id=$2 RETURNING id, author_id AS "authorId", content, created_at AS "createdAt"';
  const { rows: [row] } = await query(sql, [guildId, ticketId, authorId, content]);
  return row ?? null;
}
export async function listTicketNotes(guildId, ticketId) {
  const sql = 'SELECT n.id, n.author_id AS "authorId", n.content, n.created_at AS "createdAt" FROM ticket_notes n JOIN tickets t ON t.id=n.ticket_id WHERE t.guild_id=$1 AND t.id=$2 ORDER BY n.created_at ASC';
  const { rows } = await query(sql, [guildId, ticketId]);
  return rows;
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
    'SELECT id, channel_id AS "channelId", opener_id AS "openerId", panel_id AS "panelId", form_data AS "formData", status, claimed_by AS "claimedBy", priority, archived_at AS "archivedAt", created_at AS "createdAt", closed_at AS "closedAt" FROM tickets WHERE guild_id=$1 ORDER BY id DESC LIMIT $2',
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
