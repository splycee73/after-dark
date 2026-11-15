import {
  PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder,
} from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { createTicket, closeTicket, getTicketPanel } from '../../../services/tickets.js';
import { EconomyError } from '../../../services/economy.js';

const MODULE = 'tickets';
const colorOf = (value) => /^#[0-9a-f]{6}$/i.test(value ?? '') ? Number.parseInt(value.slice(1), 16) : 0x8b5cf6;
const fill = (s, data) => String(s ?? '').replace(/\{(user|username|server|ticket)\}/g, (_, k) => data[k] ?? '');

export async function publishTicketPanel(client, guild, panel) {
  const channel = guild.channels.cache.get(panel.panelChannelId);
  if (!channel || !channel.isTextBased()) throw new Error('El canal del panel no existe o no es de texto.');
  const e = new EmbedBuilder().setColor(colorOf(panel.color)).setTitle(panel.panelTitle).setDescription(panel.panelDescription);
  const button = new ButtonBuilder().setCustomId(`adticket:open:${panel.id}`).setLabel(panel.buttonLabel.slice(0, 80)).setStyle(ButtonStyle.Primary);
  if (panel.buttonEmoji) button.setEmoji(panel.buttonEmoji);
  const row = new ActionRowBuilder().addComponents(button);
  let msg = null;
  if (panel.messageId) msg = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [e], components: [row] });
  else msg = await channel.send({ embeds: [e], components: [row] });
  const { setTicketPanelMessage } = await import('../../../services/tickets.js');
  await setTicketPanelMessage(guild.id, panel.id, msg.id);
  return msg;
}

async function makeTicket(interaction, panel, answers = {}) {
  const guild = interaction.guild;
  const existing = guild.channels.cache.find((c) => c.topic?.includes(`ticket-owner:${interaction.user.id}`) && c.topic?.includes('ticket-status:open'));
  if (existing) {
    if (interaction.isModalSubmit()) return interaction.reply({ content: `Ya tienes un ticket abierto: <#${existing.id}>.`, ephemeral: true });
    return interaction.reply({ content: `Ya tienes un ticket abierto: <#${existing.id}>.`, ephemeral: true });
  }
  const roleId = panel?.supportRoleId;
  const category = panel?.categoryId && guild.channels.cache.get(panel.categoryId);
  const perms = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
  ];
  if (roleId && guild.roles.cache.has(roleId)) perms.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const slug = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) || 'usuario';
  const channel = await guild.channels.create({
    name: `ticket-${slug}`, type: ChannelType.GuildText,
    ...(category?.type === ChannelType.GuildCategory ? { parent: category.id } : {}),
    topic: `ticket-owner:${interaction.user.id};ticket-status:open;ticket-panel:${panel?.id ?? 'default'}`,
    permissionOverwrites: perms, reason: `Ticket abierto por ${interaction.user.tag}`,
  });
  try {
    const row = await createTicket(guild.id, channel.id, interaction.user.id, panel?.id ?? null, answers);
    const intro = panel
      ? fill(panel.welcomeMessage, { user: `<@!${interaction.user.id}>`, username: interaction.user.username, server: guild.name, ticket: String(row.id) })
      : 'Describe tu problema con el mayor detalle posible. El equipo te atenderá pronto.';
    const title = panel ? fill(panel.welcomeTitle, { user: interaction.user.username, username: interaction.user.username, server: guild.name, ticket: String(row.id) }) : `🎫 Ticket #${row.id}`;
    const description = [intro, ...Object.entries(answers).map(([k,v]) => `**${k}:** ${v}`)].join('\n\n');
    const close = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`adticket:close:${channel.id}`).setLabel('Cerrar ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
    await channel.send({
      content: `<@!${interaction.user.id}> ${roleId ? `<@&${roleId}>` : ''}`,
      embeds: [new EmbedBuilder().setColor(colorOf(panel?.color)).setTitle(title).setDescription(description.slice(0, 4000))],
      components: [close], allowedMentions: { users: [interaction.user.id], roles: roleId ? [roleId] : [] },
    });
    await interaction.reply({ content: `✅ Tu ticket está listo: <#${channel.id}>.`, ephemeral: true });
  } catch (error) {
    await channel.delete('No se pudo completar la creación del ticket').catch(() => {});
    throw error;
  }
}

async function closeFromInteraction(interaction, channelId) {
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.topic?.includes('ticket-status:open')) return interaction.reply({ content: 'Este ticket ya está cerrado.', ephemeral: true });
  const owner = channel.topic.match(/ticket-owner:(\d{17,20})/)?.[1];
  const panelId = Number(channel.topic.match(/ticket-panel:(\d+)/)?.[1]);
  const panel = Number.isSafeInteger(panelId) ? await getTicketPanel(panelId, interaction.guild.id) : null;
  const roleId = panel?.supportRoleId;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff = roleId && member?.roles.cache.has(roleId);
  if (owner !== interaction.user.id && !isStaff && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels))
    return interaction.reply({ content: 'Solo quien abrió el ticket o el equipo de soporte puede cerrarlo.', ephemeral: true });
  const row = await closeTicket(channel.id, interaction.user.id);
  if (!row) return interaction.reply({ content: 'Este ticket ya fue cerrado.', ephemeral: true });
  const message = fill(panel?.closeMessage ?? '🔒 Ticket cerrado por {user}.', { user: interaction.user.username, username: interaction.user.username, server: interaction.guild.name, ticket: String(row.id) });
  await interaction.reply({ content: message, ephemeral: false });
  await channel.permissionOverwrites.edit(owner, { SendMessages: false }).catch(() => {});
  await channel.setTopic((channel.topic ?? '').replace('ticket-status:open', 'ticket-status:closed')).catch(() => {});
  await channel.send({ content: 'Este canal se eliminará en 10 segundos. El equipo puede conservarlo si necesita revisar el caso.' }).catch(() => {});
  setTimeout(() => channel.delete(`Ticket #${row.id} cerrado por ${interaction.user.tag}`).catch(() => {}), 10_000);
}

const open = defineCommand({
  name: 'ticket', description: 'Abre un ticket privado', module: MODULE,
  async run(ctx) {
    const { config: cfg } = await getModuleState(ctx.guild.id, MODULE);
    const panel = cfg.defaultPanelId ? await getTicketPanel(cfg.defaultPanelId, ctx.guild.id) : null;
    await makeTicket({ ...ctx, isModalSubmit: () => false }, panel);
  },
});
const close = defineCommand({
  name: 'close', description: 'Cierra el ticket actual', module: MODULE,
  async run(ctx) {
    const topic = ctx.channel.topic ?? '';
    const owner = topic.match(/ticket-owner:(\d{17,20})/)?.[1];
    if (!owner || !topic.includes('ticket-status:open')) throw new EconomyError('Este canal no es un ticket abierto.');
    const { config: cfg } = await getModuleState(ctx.guild.id, MODULE);
    const isStaff = cfg.supportRoleId && ctx.member.roles.cache.has(cfg.supportRoleId);
    if (owner !== ctx.user.id && !isStaff && !ctx.member.permissions.has(PermissionFlagsBits.ManageChannels))
      throw new EconomyError('Solo quien abrió el ticket o el equipo de soporte puede cerrarlo.');
    const row = await closeTicket(ctx.channel.id, ctx.user.id);
    if (!row) throw new EconomyError('Este ticket ya fue cerrado.');
    await ctx.channel.send({ embeds: [embed('🔒 Ticket cerrado', `Cerrado por <@!${ctx.user.id}>.`)] });
    await ctx.channel.permissionOverwrites.edit(owner, { SendMessages: false }).catch(() => {});
    await ctx.channel.setTopic(topic.replace('ticket-status:open', 'ticket-status:closed')).catch(() => {});
    setTimeout(() => ctx.channel.delete(`Ticket #${row.id} cerrado por ${ctx.user.tag}`).catch(() => {}), 10_000);
  },
});

export default {
  commands: [open, close],
  events: [{
    name: 'interactionCreate',
    async execute(client, interaction) {
      if (!interaction.inGuild()) return;
      try {
        if (interaction.isButton()) {
          const [, action, id] = interaction.customId.split(':');
          if (action === 'open') {
            const panel = await getTicketPanel(id, interaction.guild.id);
            if (!panel?.active) return interaction.reply({ content: 'Este panel ya no está disponible.', ephemeral: true });
            if (panel.formFields?.length) {
              const modal = new ModalBuilder().setCustomId(`adticket:form:${panel.id}`).setTitle(panel.name.slice(0, 45));
              const rows = panel.formFields.slice(0, 5).map((f, i) => new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId(`field${i}`).setLabel(f.label.slice(0, 45))
                  .setStyle(f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                  .setRequired(f.required !== false).setMaxLength(Math.min(1000, Math.max(1, f.maxLength || 300)))
                  .setPlaceholder((f.placeholder || '').slice(0, 100))));
              modal.addComponents(...rows);
              return interaction.showModal(modal);
            }
            return makeTicket(interaction, panel);
          }
          if (action === 'close') return closeFromInteraction(interaction, id);
        }
        if (interaction.isModalSubmit() && interaction.customId.startsWith('adticket:form:')) {
          const id = interaction.customId.split(':')[2];
          const panel = await getTicketPanel(id, interaction.guild.id);
          if (!panel?.active) return interaction.reply({ content: 'Este panel ya no está disponible.', ephemeral: true });
          const answers = Object.fromEntries(panel.formFields.slice(0,5).map((f,i) => [f.label, interaction.fields.getTextInputValue(`field${i}`)]));
          return makeTicket(interaction, panel, answers);
        }
      } catch (error) {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred)
          await interaction.reply({ content: 'No se pudo procesar el ticket. Revisa los permisos del bot.', ephemeral: true }).catch(() => {});
        throw error;
      }
    },
  }],
};
