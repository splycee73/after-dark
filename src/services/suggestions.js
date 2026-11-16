import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { query, withTx } from '../db/pool.js';
import { EconomyError, claimCooldown } from './economy.js';
import { getModuleState } from './guilds.js';

const COLORS = { pending: 0x8b5cf6, approved: 0x34d399, rejected: 0xf87171 };
const LABEL = { pending: '⏳ Pendiente', approved: '✅ Aprobada', rejected: '❌ Rechazada' };

async function counts(id) {
  const { rows: [r] } = await query(
    'SELECT COUNT(*) FILTER (WHERE vote=1)::int AS up, COUNT(*) FILTER (WHERE vote=-1)::int AS down FROM suggestion_votes WHERE suggestion_id=$1', [id]);
  return r;
}
const buttons = (c) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('sg:up').setLabel(`${c.up}`).setEmoji('👍').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('sg:down').setLabel(`${c.down}`).setEmoji('👎').setStyle(ButtonStyle.Danger));

function buildEmbed(s, cfg, c) {
  const e = new EmbedBuilder().setColor(COLORS[s.status]).setTitle(`Sugerencia #${s.number}`).setDescription(s.content)
    .addFields({ name: 'Autor', value: cfg.anonymous ? 'Anónimo' : `<@${s.user_id}>`, inline: true }, { name: 'Estado', value: LABEL[s.status], inline: true })
    .setTimestamp(new Date(s.created_at));
  if (s.status !== 'pending') e.addFields({ name: `Decisión de <@${s.decided_by}>`, value: s.decision_reason || 'Sin motivo' });
  if (c && s.status === 'pending') e.setFooter({ text: `👍 ${c.up} · 👎 ${c.down}` });
  return e;
}

export async function createSuggestion({ guild, user, content }) {
  const { config: cfg } = await getModuleState(guild.id, 'sugerencias');
  const ch = cfg.channelId && guild.channels.cache.get(cfg.channelId);
  if (!ch?.isTextBased()) throw new EconomyError('El servidor aún no configuró el canal de sugerencias.');
  const text = content.trim();
  if (text.length < cfg.minLength) throw new EconomyError(`Tu sugerencia es muy corta (mínimo ${cfg.minLength} caracteres).`);
  if (text.length > cfg.maxLength) throw new EconomyError(`Tu sugerencia es muy larga (máximo ${cfg.maxLength} caracteres).`);
  const cd = await claimCooldown(guild.id, user.id, 'suggest', cfg.cooldown);
  if (!cd.ok) throw new EconomyError(`Espera ${cd.remaining}s antes de enviar otra sugerencia.`);
  const s = await withTx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sug:${guild.id}`]);
    return (await c.query(
      `INSERT INTO suggestions (guild_id, number, user_id, content, channel_id)
       VALUES ($1, (SELECT COALESCE(MAX(number),0)+1 FROM suggestions WHERE guild_id=$1), $2, $3, $4) RETURNING *`, [guild.id, user.id, text, ch.id])).rows[0];
  });
  try {
    const msg = await ch.send({ embeds: [buildEmbed(s, cfg, { up: 0, down: 0 })], components: [buttons({ up: 0, down: 0 })] });
    await query('UPDATE suggestions SET message_id=$2 WHERE id=$1', [s.id, msg.id]);
  } catch {
    await query('DELETE FROM suggestions WHERE id=$1', [s.id]);
    throw new EconomyError('No pude publicar en el canal de sugerencias. Revisa los permisos del bot.');
  }
  return s;
}

export async function vote(interaction, value) {
  const { rows: [s] } = await query('SELECT * FROM suggestions WHERE message_id=$1', [interaction.message.id]);
  if (!s || s.status !== 'pending') return interaction.reply({ content: 'Esta sugerencia ya fue resuelta.', ephemeral: true });
  const { config: cfg } = await getModuleState(s.guild_id, 'sugerencias');
  const { rows: [cur] } = await query('SELECT vote FROM suggestion_votes WHERE suggestion_id=$1 AND user_id=$2', [s.id, interaction.user.id]);
  if (cur?.vote === value) await query('DELETE FROM suggestion_votes WHERE suggestion_id=$1 AND user_id=$2', [s.id, interaction.user.id]);
  else await query('INSERT INTO suggestion_votes (suggestion_id, user_id, vote) VALUES ($1,$2,$3) ON CONFLICT (suggestion_id, user_id) DO UPDATE SET vote=$3', [s.id, interaction.user.id, value]);
  const c = await counts(s.id);
  await interaction.update({ embeds: [buildEmbed(s, cfg, c)], components: [buttons(c)] });
}

export const canReview = (member, cfg) => member.permissions.has(P.ManageGuild) || (cfg.reviewRoleId && member.roles.cache.has(cfg.reviewRoleId));

export async function decide({ client, guild, number, status, by, reason }) {
  const { rows: [s] } = await query(
    `UPDATE suggestions SET status=$3, decided_by=$4, decision_reason=$5, decided_at=now()
     WHERE guild_id=$1 AND number=$2 AND status='pending' RETURNING *`, [guild.id, number, status, by, (reason ?? '').slice(0, 500)]);
  if (!s) throw new EconomyError('No encontré una sugerencia pendiente con ese número.');
  const { config: cfg } = await getModuleState(guild.id, 'sugerencias');
  const ch = guild.channels.cache.get(s.channel_id);
  const msg = ch?.isTextBased() ? await ch.messages.fetch(s.message_id).catch(() => null) : null;
  await msg?.edit({ embeds: [buildEmbed(s, cfg)], components: [] }).catch(() => {});
  if (cfg.dmOnDecision) {
    const u = await client.users.fetch(s.user_id).catch(() => null);
    await u?.send(`Tu sugerencia #${s.number} en **${guild.name}** fue ${status === 'approved' ? 'aprobada ✅' : 'rechazada ❌'}.${s.decision_reason ? `\nMotivo: ${s.decision_reason}` : ''}`).catch(() => {});
  }
  return s;
}

export async function listSuggestions(g, limit = 30) {
  const { rows } = await query('SELECT number, user_id, content, status, decision_reason, created_at FROM suggestions WHERE guild_id=$1 ORDER BY id DESC LIMIT $2', [g, limit]);
  return rows.map((r) => ({ number: r.number, userId: r.user_id, content: r.content, status: r.status, reason: r.decision_reason, at: r.created_at }));
}
