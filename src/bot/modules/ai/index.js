import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { claimCooldown } from '../../../services/economy.js';
import { askAI, aiConfigured, takeDailyUse } from '../../../services/ai.js';
import { logger } from '../../../lib/logger.js';

const chunks = (t) => t.match(/[\\s\\S]{1,1900}(\\s|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [t.slice(0, 1900)];

async function history(m, client, n) {
  const msgs = n > 0 ? [...(await m.channel.messages.fetch({ limit: n + 1, before: m.id })).values()].reverse() : [];
  const out = [];
  for (const x of [...msgs, m]) {
    const mine = x.author.id === client.user.id;
    if (x.author.bot && !mine) continue;
    const text = x.content.trim();
    if (!text) continue;
    const role = mine ? 'assistant' : 'user';
    const content = mine ? text : `[${x.member?.displayName ?? x.author.username}]: ${text}`;
    if (out.at(-1)?.role === role) out.at(-1).content += `\\n${content}`; else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export default {
  commands: [],
  events: [{
    name: Events.MessageCreate,
    async execute(client, m) {
      if (m.author.bot || !m.guild || !m.content.trim()) return;
      const { enabled, config: c } = await getModuleState(m.guild.id, 'ia');
      if (!enabled || !c.channelId || m.channelId !== c.channelId) return;
      if (c.allowedRoleId && !m.member?.roles.cache.has(c.allowedRoleId)) return;
      if (!aiConfigured()) return void m.reply('⚠️ La IA no está configurada (falta GEMINI_API_KEY en el servidor del bot).').catch(() => {});
      const cd = await claimCooldown(m.guild.id, m.author.id, 'ai', c.cooldown);
      if (!cd.ok) return void m.react('⏳').catch(() => {});
      if (!(await takeDailyUse(m.guild.id, m.author.id, c.dailyLimit))) return void m.reply('Alcanzaste tu límite diario de mensajes con la IA.').catch(() => {});
      try {
        // Recupera menos contexto y muestra "escribiendo" en paralelo para reducir la espera.
        const memoryMessages = Math.min(Math.max(Number(c.memoryMessages) || 0, 0), 4);
        const maxTokens = Math.min(Math.max(Number(c.maxTokens) || 300, 50), 300);
        const [messages] = await Promise.all([
          history(m, client, memoryMessages),
          m.channel.sendTyping(),
        ]);
        const text = await askAI({
          maxTokens, messages,
          system: `${c.systemPrompt}\\n\\nResponde de forma directa y breve, en menos de 1900 caracteres. No repitas el nombre del usuario ni el formato de los mensajes.`,
        });
        const parts = chunks(text || '…');
        await m.reply({ content: parts[0], allowedMentions: { parse: [], repliedUser: false } });
        for (const p of parts.slice(1)) await m.channel.send({ content: p, allowedMentions: { parse: [] } });
      } catch (e) {
        logger.error('IA:', e.message);
        await m.reply('😵 La IA no está disponible ahora mismo. Inténtalo en un momento.').catch(() => {});
      }
    },
  }],
};
