import { PermissionFlagsBits as P } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { addEntry, removeEntry, listEntries } from '../../../services/whitelist.js';
import { EconomyError } from '../../../services/economy.js';

const M = 'whitelist';
const USER = { name: 'usuario', type: 'user', description: 'Usuario', required: true };

const add = defineCommand({
  name: 'whitelist-add', description: 'Añade un usuario a la whitelist', module: M, perms: [P.ManageGuild],
  options: [USER, { name: 'nota', type: 'string', description: 'Nota opcional' }],
  async run(ctx) {
    if (ctx.args.usuario.bot) throw new EconomyError('No se puede añadir un bot a la whitelist.');
    await addEntry(ctx.guild, ctx.args.usuario.id, ctx.user.id, ctx.args.nota ?? '');
    await ctx.reply({ embeds: [embed('✅ Whitelist', `<@${ctx.args.usuario.id}> fue añadido.`)] });
  },
});
const remove = defineCommand({
  name: 'whitelist-remove', description: 'Quita un usuario de la whitelist', module: M, perms: [P.ManageGuild], options: [USER],
  async run(ctx) {
    const ok = await removeEntry(ctx.guild, ctx.args.usuario.id);
    if (!ok) throw new EconomyError('Ese usuario no estaba en la whitelist.');
    await ctx.reply({ embeds: [embed('🗑️ Whitelist', `<@${ctx.args.usuario.id}> fue quitado.`)] });
  },
});
const listCmd = defineCommand({
  name: 'whitelist-list', description: 'Muestra los usuarios de la whitelist', module: M, perms: [P.ManageGuild],
  async run(ctx) {
    const rows = await listEntries(ctx.guild.id, 30);
    await ctx.reply({ embeds: [embed(`📋 Whitelist (${rows.length})`, rows.length ? rows.map((r) => `<@${r.userId}>${r.note ? ` — ${r.note}` : ''}`).join('\n') : 'Vacía.')], ephemeral: true });
  },
});

export default { commands: [add, remove, listCmd], events: [] };
