import { Events, EmbedBuilder } from 'discord.js';
import { bus, emitLog } from '../../../lib/bus.js';
import { getModuleState } from '../../../services/guilds.js';
import { logger } from '../../../lib/logger.js';

const cut = (s, n = 1000) => (s ? String(s).slice(0, n) : '*(vacío)*');

export default {
  commands: [],
  events: [
    {
      name: Events.ClientReady, once: true,
      async execute(client) {
        bus.on('log', async ({ guildId, event, data }) => {
          try {
            const { enabled, config: c } = await getModuleState(guildId, 'logs');
            if (!enabled || !c[`ev_${event}`]) return;
            const ch = client.channels.cache.get(c[`ch_${event}`] || c.channelId);
            if (!ch?.isTextBased()) return;
            const e = new EmbedBuilder().setColor(data.color ?? 0x8b5cf6).setTitle(data.title).setDescription(data.description || '\u200b').setTimestamp();
            if (data.fields?.length) e.addFields(data.fields);
            await ch.send({ embeds: [e], allowedMentions: { parse: [] } });
          } catch (err) { logger.warn('Logs:', err.message); }
        });
      },
    },
    {
      name: Events.MessageDelete,
      async execute(_c, m) {
        if (!m.guild || m.author?.bot) return;
        emitLog(m.guild.id, 'message_delete', {
          title: '🗑️ Mensaje eliminado', color: 0xf87171,
          description: `Autor: ${m.author ? `<@${m.author.id}>` : 'desconocido'} · Canal: <#${m.channelId}>`,
          fields: [{ name: 'Contenido', value: cut(m.content) }],
        });
      },
    },
    {
      name: Events.MessageUpdate,
      async execute(_c, o, n) {
        if (!n.guild || n.author?.bot || o.partial || o.content === n.content) return;
        emitLog(n.guild.id, 'message_edit', {
          title: '✏️ Mensaje editado', color: 0xfbbf24,
          description: `Autor: <@${n.author.id}> · [Ir al mensaje](${n.url})`,
          fields: [{ name: 'Antes', value: cut(o.content) }, { name: 'Después', value: cut(n.content) }],
        });
      },
    },
    {
      name: Events.GuildMemberUpdate,
      async execute(_c, o, n) {
        if (o.partial) return;
        const added = n.roles.cache.filter((r) => !o.roles.cache.has(r.id));
        const removed = o.roles.cache.filter((r) => !n.roles.cache.has(r.id));
        if (added.size || removed.size) {
          emitLog(n.guild.id, 'role_change', {
            title: '🏷️ Roles modificados', description: `Miembro: <@${n.id}>`,
            fields: [added.size && { name: 'Añadidos', value: added.map((r) => `<@&${r.id}>`).join(' ') }, removed.size && { name: 'Quitados', value: removed.map((r) => `<@&${r.id}>`).join(' ') }].filter(Boolean),
          });
        }
        if (o.nickname !== n.nickname) {
          emitLog(n.guild.id, 'nick_change', {
            title: '📝 Apodo cambiado', description: `Miembro: <@${n.id}>`,
            fields: [{ name: 'Antes', value: cut(o.nickname ?? o.user.username, 100) }, { name: 'Después', value: cut(n.nickname ?? n.user.username, 100) }],
          });
        }
      },
    },
  ],
};
