import { Events, PermissionFlagsBits } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { createTicket, closeTicket } from '../../../services/tickets.js';
import { EconomyError } from '../../../services/economy.js';

const MODULE = 'tickets';

const open = defineCommand({
  name: 'ticket',
  description: 'Abre un ticket privado con el equipo de soporte',
  module: MODULE,
  async run(ctx) {
    const { config: cfg } = await getModuleState(ctx.guild.id, MODULE);
    const existing = ctx.guild.channels.cache.find((c) => c.topic?.includes(`ticket-owner:${ctx.user.id}`) && c.topic?.includes('ticket-status:open'));
    if (existing) throw new EconomyError(`Ya tienes un ticket abierto: <#${existing.id}>`);
    const perms = [
      { id: ctx.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ctx.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: ctx.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ];
    if (cfg.supportRoleId && ctx.guild.roles.cache.has(cfg.supportRoleId)) {
      perms.push({ id: cfg.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    const channel = await ctx.guild.channels.create({
      name: `ticket-${ctx.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 18) || 'usuario'}`,
      type: 0,
      topic: `ticket-owner:${ctx.user.id};ticket-status:open`,
      permissionOverwrites: perms,
      reason: `Ticket abierto por ${ctx.user.tag}`,
    });
    const row = await createTicket(ctx.guild.id, channel.id, ctx.user.id);
    await channel.send({
      content: `<@${ctx.user.id}> ${cfg.supportRoleId ? `<@&${cfg.supportRoleId}>` : ''}`,
      embeds: [embed(`🎫 Ticket #${row.id}`, 'Describe tu problema con el mayor detalle posible. El equipo te atenderá pronto.\n\nUsa `.close` para cerrar este ticket.')],
      allowedMentions: { users: [ctx.user.id], roles: cfg.supportRoleId ? [cfg.supportRoleId] : [] },
    });
    await ctx.reply({ embeds: [embed('✅ Ticket creado', `Tu canal privado es <#${channel.id}>.`)], ephemeral: true });
  },
});

const close = defineCommand({
  name: 'close',
  description: 'Cierra el ticket actual',
  module: MODULE,
  async run(ctx) {
    const topic = ctx.channel.topic ?? '';
    const owner = topic.match(/ticket-owner:(\d{17,20})/)?.[1];
    if (!owner || !topic.includes('ticket-status:open')) throw new EconomyError('Este canal no es un ticket abierto.');
    const { config: cfg } = await getModuleState(ctx.guild.id, MODULE);
    const isStaff = cfg.supportRoleId && ctx.member.roles.cache.has(cfg.supportRoleId);
    if (owner !== ctx.user.id && !isStaff && !ctx.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new EconomyError('Solo quien abrió el ticket o el equipo de soporte puede cerrarlo.');
    }
    const row = await closeTicket(ctx.channel.id, ctx.user.id);
    if (!row) throw new EconomyError('Este ticket ya fue cerrado.');
    await ctx.channel.send({ embeds: [embed('🔒 Ticket cerrado', `Cerrado por <@!${ctx.user.id}>. El canal se eliminará en unos segundos.`)] });
    await ctx.reply({ content: 'Ticket cerrado.', ephemeral: true }).catch(() => {});
    await ctx.channel.delete(`Ticket #${row.id} cerrado por ${ctx.user.tag}`).catch(() => {});
  },
});

export default { commands: [open, close], events: [] };
