import { Events, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { EconomyError } from '../../../services/economy.js';
import {
  categories, openTicket, claimTicket, closeTicket, rateTicket, getByChannel, isSupport,
} from '../../../services/tickets.js';
import { logger } from '../../../lib/logger.js';

const supportOf = (member, cfg, t) => isSupport(member, { ...cfg, supportRoleIds: t.panel_id ? (t.panel_roles ?? []) : (cfg.supportRoleIds ?? []) }, { supportRoleIds: t.cat_roles ?? [] });

async function ticketOf(ctx) {
  const t = await getByChannel(ctx.channel.id);
  if (!t || t.status !== 'open') throw new EconomyError('Este comando solo funciona dentro de un ticket abierto.');
  const { config } = await getModuleState(ctx.guild.id, 'tickets');
  if (!supportOf(ctx.member, config, t)) throw new EconomyError('Solo el equipo de soporte puede hacer esto.');
  return t;
}

const add = defineCommand({
  name: 'ticketadd', description: 'Añade un usuario al ticket', module: 'tickets',
  options: [{ name: 'usuario', type: 'user', description: 'Usuario a añadir', required: true }],
  async run(ctx) {
    await ticketOf(ctx);
    await ctx.channel.permissionOverwrites.edit(ctx.args.usuario.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    await ctx.reply({ embeds: [embed('➕ Usuario añadido', `<@${ctx.args.usuario.id}> ahora puede ver este ticket.`)] });
  },
});
const remove = defineCommand({
  name: 'ticketremove', description: 'Quita un usuario del ticket', module: 'tickets',
  options: [{ name: 'usuario', type: 'user', description: 'Usuario a quitar', required: true }],
  async run(ctx) {
    const t = await ticketOf(ctx);
    if (ctx.args.usuario.id === t.owner_id) throw new EconomyError('No puedes quitar al dueño del ticket; ciérralo en su lugar.');
    await ctx.channel.permissionOverwrites.delete(ctx.args.usuario.id);
    await ctx.reply({ embeds: [embed('➖ Usuario quitado', `<@${ctx.args.usuario.id}> ya no ve este ticket.`)] });
  },
});
const close = defineCommand({
  name: 'ticketclose', description: 'Cierra el ticket actual', module: 'tickets', aliases: ['close'],
  options: [{ name: 'motivo', type: 'string', description: 'Motivo del cierre' }],
  async run(ctx) {
    const t = await ticketOf(ctx);
    await ctx.reply({ content: '🔒 Cerrando ticket…' });
    await closeTicket({ client: ctx.client, guild: ctx.guild, channel: ctx.channel, ticket: t, closer: ctx.user, reason: ctx.args.motivo });
  },
});

async function handle(i) {
  const st = await getModuleState(i.guild.id, 'tickets');
  if (!st.enabled) return i.reply({ content: 'El sistema de tickets está desactivado.', ephemeral: true });
  const cfg = st.config;
  const [, action, arg, panelId] = i.customId.split(':');

  if (action === 'open') {
    const cat = await categories.get(i.guild.id, arg);
    if (!cat || !cat.enabled) return i.reply({ content: 'Esta categoría ya no existe.', ephemeral: true });
    if (cat.questions.length) {
      const modal = new ModalBuilder().setCustomId(`tk:form:${cat.id}:${panelId ?? ''}`).setTitle(cat.name.slice(0, 45));
      cat.questions.forEach((q, idx) => modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(`q${idx}`).setLabel(q).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
      return i.showModal(modal);
    }
    await i.deferReply({ ephemeral: true });
    const { channel } = await openTicket({ guild: i.guild, member: i.member, categoryId: cat.id, panelId: panelId ?? null });
    return i.editReply(`✅ Tu ticket está listo: <#${channel.id}>`);
  }
  if (action === 'form') {
    const cat = await categories.get(i.guild.id, arg);
    if (!cat) return i.reply({ content: 'Esta categoría ya no existe.', ephemeral: true });
    const answers = cat.questions.map((_, idx) => i.fields.getTextInputValue(`q${idx}`));
    await i.deferReply({ ephemeral: true });
    const { channel } = await openTicket({ guild: i.guild, member: i.member, categoryId: cat.id, panelId: panelId ?? null, answers });
    return i.editReply(`✅ Tu ticket está listo: <#${channel.id}>`);
  }

  const t = await getByChannel(i.channelId);
  if (!t) return i.reply({ content: 'Este canal no es un ticket.', ephemeral: true });
  const support = supportOf(i.member, cfg, t);
  if (action === 'claim') {
    if (!support) return i.reply({ content: 'Solo el equipo de soporte puede reclamar tickets.', ephemeral: true });
    await claimTicket({ ticket: t, member: i.member });
    return i.reply({ content: `🙋 <@${i.user.id}> reclamó este ticket.`, allowedMentions: { parse: [] } });
  }
  if (action === 'close') {
    if (!support) return i.reply({ content: 'Solo el staff autorizado puede cerrar este ticket.', ephemeral: true });
    await i.reply({ content: '🔒 Cerrando ticket…' });
    return closeTicket({ client: i.client, guild: i.guild, channel: i.channel, ticket: t, closer: i.user, reason: 'Cerrado con el botón' });
  }
  if (action === 'delete') {
    if (!support) return i.reply({ content: 'Solo el equipo de soporte puede eliminar el canal.', ephemeral: true });
    await i.reply({ content: '🗑️ Eliminando el canal en 3 segundos…' });
    setTimeout(() => i.channel.delete('Ticket eliminado').catch(() => {}), 3000);
  }
}

export default {
  commands: [close],
  events: [{
    name: Events.InteractionCreate,
    async execute(_client, i) {
      if (!(i.isButton() || i.isModalSubmit()) || !i.customId.startsWith('tk:')) return;
      try {
        if (i.customId.startsWith('tk:rate:')) { // llega por mensaje directo, sin servidor
          const [, , id, n] = i.customId.split(':');
          const ok = await rateTicket(id, i.user.id, Math.min(5, Math.max(1, Number(n))));
          return i.update({ content: ok ? '¡Gracias por tu valoración! ⭐' : 'Ya valoraste este ticket.', components: [] });
        }
        if (!i.guild) return;
        await handle(i);
      } catch (e) {
        const msg = e instanceof EconomyError ? `⚠️ ${e.message}` : '❌ Ocurrió un error.';
        if (!(e instanceof EconomyError)) logger.error('Tickets:', e);
        await (i.deferred || i.replied ? i.editReply({ content: msg }) : i.reply({ content: msg, ephemeral: true })).catch(() => {});
      }
    },
  }],
};
