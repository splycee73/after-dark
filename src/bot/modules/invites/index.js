import { Events } from 'discord.js';
import { defineCommand, embed } from '../../lib/command.js';
import { prime, onInviteCreate, onInviteDelete, stats, top } from '../../../services/invites.js';

const invites = defineCommand({
  name: 'invites', description: 'Mira tus invitaciones (o las de otro usuario)', module: 'invites',
  options: [{ name: 'usuario', type: 'user', description: 'Usuario a consultar' }],
  async run(ctx) {
    const u = ctx.args.usuario ?? ctx.user; const s = await stats(ctx.guild.id, u.id);
    await ctx.reply({ embeds: [embed(`📨 Invitaciones de ${u.username}`, `✅ Válidas: **${s.valid}**\n📊 Totales: **${s.total}**\n🚪 Se fueron: **${s.left}**\n🕵️ Falsas: **${s.fake}**`)] });
  },
});
const invitetop = defineCommand({
  name: 'invitetop', description: 'Ranking de invitadores', module: 'invites', aliases: ['inviteleaderboard'],
  async run(ctx) {
    const rows = await top(ctx.guild.id, 10);
    await ctx.reply({ embeds: [embed('🏆 Top invitadores', rows.length ? rows.map((r, i) => `**${i + 1}.** <@${r.inviterId}> — **${r.valid}** válidas (${r.total} totales, ${r.left} se fueron, ${r.fake} falsas)`).join('\n') : 'Aún no hay datos.')] });
  },
});

export default {
  commands: [invites, invitetop],
  events: [
    { name: Events.ClientReady, once: true, async execute(client) { for (const g of client.guilds.cache.values()) await prime(g); } },
    { name: Events.GuildCreate, execute: (_c, g) => prime(g) },
    { name: Events.InviteCreate, execute: async (_c, inv) => onInviteCreate(inv) },
    { name: Events.InviteDelete, execute: async (_c, inv) => onInviteDelete(inv) },
  ],
};
