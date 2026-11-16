import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { attempt } from '../../../services/counter.js';

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export default {
  commands: [],
  events: [{
    name: Events.MessageCreate,
    async execute(_client, m) {
      if (m.author.bot || !m.guild) return;
      const { enabled, config: c } = await getModuleState(m.guild.id, 'contador');
      if (!enabled || !c.channelId || m.channelId !== c.channelId) return;

      if (c.allowedRoleId && !m.member?.roles.cache.has(c.allowedRoleId)) return void m.delete().catch(() => {});
      const text = m.content.trim();
      if (!/^\d{1,15}$/.test(text)) { if (c.deleteInvalid) m.delete().catch(() => {}); return; }

      const n = Number(text);
      const r = await attempt(m.guild.id, m.author.id, n, c);
      if (r.ok) {
        if (c.successEmoji) await m.react(c.successEmoji).catch(() => {});
        if (c.successMessage) await m.channel.send(fill(c.successMessage, { user: `<@${m.author.id}>`, number: n }));
      } else {
        await m.react('❌').catch(() => {});
        await m.channel.send({
          content: fill(c.errorMessage, { user: `<@${m.author.id}>`, number: n, expected: r.expected, start: r.start, reason: r.reason }),
          allowedMentions: { users: [m.author.id] },
        });
      }
    },
  }],
};
