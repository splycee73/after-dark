import { Events, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

const joins = new Map(); // guildId -> timestamps
const lastRaid = new Map();

async function alert(guild, title, description) {
  const { enabled, config: c } = await getModuleState(guild.id, 'alertas');
  if (!enabled) return;
  const ch = c.channelId && guild.channels.cache.get(c.channelId);
  if (!ch?.isTextBased()) return;
  await ch.send({
    content: c.pingRoleId ? `<@&${c.pingRoleId}>` : undefined,
    embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle(`🚨 ${title}`).setDescription(description).setTimestamp()],
    allowedMentions: { roles: c.pingRoleId ? [c.pingRoleId] : [] },
  }).catch((e) => logger.warn('Alertas:', e.message));
}
const cfgOf = async (g) => { const s = await getModuleState(g.id, 'alertas'); return s.enabled ? s.config : null; };

export default {
  commands: [],
  events: [
    {
      name: Events.GuildMemberAdd,
      async execute(_c, m) {
        const c = await cfgOf(m.guild); if (!c) return;
        const days = (Date.now() - m.user.createdTimestamp) / 86400000;
        if (c.newAccountEnabled && days < c.newAccountDays) await alert(m.guild, 'Cuenta nueva', `<@${m.id}> (${m.user.tag}) entró con una cuenta de **${days.toFixed(1)}** días.`);
        if (!c.raidEnabled) return;
        const now = Date.now();
        const arr = (joins.get(m.guild.id) ?? []).filter((t) => now - t < c.raidWindow * 1000);
        arr.push(now); joins.set(m.guild.id, arr);
        if (arr.length >= c.raidJoins && now - (lastRaid.get(m.guild.id) ?? 0) > 60_000) {
          lastRaid.set(m.guild.id, now);
          await alert(m.guild, 'Posible raid', `**${arr.length}** miembros entraron en menos de ${c.raidWindow} segundos.`);
        }
      },
    },
    {
      name: Events.GuildMemberUpdate,
      async execute(_c, o, n) {
        if (o.partial) return;
        const c = await cfgOf(n.guild); if (!c?.adminRoleEnabled) return;
        const admin = n.roles.cache.filter((r) => !o.roles.cache.has(r.id) && r.permissions.has(P.Administrator));
        if (admin.size) await alert(n.guild, 'Rol de administrador entregado', `<@${n.id}> recibió ${admin.map((r) => `**${r.name}**`).join(', ')}.`);
      },
    },
    {
      name: Events.ChannelDelete,
      async execute(_c, ch) {
        if (!ch.guild) return;
        const c = await cfgOf(ch.guild); if (!c?.channelDeleteEnabled) return;
        await alert(ch.guild, 'Canal eliminado', `Se eliminó el canal **#${ch.name}**.`);
      },
    },
    {
      name: Events.MessageBulkDelete,
      async execute(_c, msgs, ch) {
        if (!ch.guild) return;
        const c = await cfgOf(ch.guild); if (!c?.bulkDeleteEnabled) return;
        await alert(ch.guild, 'Borrado masivo', `Se eliminaron **${msgs.size}** mensajes en <#${ch.id}>.`);
      },
    },
  ],
};
