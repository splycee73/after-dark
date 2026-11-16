import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getModuleState } from '../../services/guilds.js';
import { EconomyError } from '../../services/economy.js';
import { logger } from '../../lib/logger.js';

export const COLOR = 0x8b5cf6;
export const embed = (title, desc, color = COLOR) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
export const fmtDuration = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && `${x}s`].filter(Boolean).join(' ');
};

const ADD = { user: 'addUserOption', int: 'addIntegerOption', string: 'addStringOption' };
const ID = /^<@!?(\d+)>$|^(\d{17,20})$/;

// Un solo comando sirve como /slash y como prefijo (.nombre).
// options: [{ name, type:'user'|'int'|'string', description, required }]  ·  perms: permisos de Discord requeridos
export function defineCommand({ name, description, module, aliases = [], options = [], perms = [], defer = false, run }) {
  const data = new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
  if (perms.length) data.setDefaultMemberPermissions(perms.reduce((a, b) => a | b, 0n));
  for (const o of options) {
    data[ADD[o.type]]((opt) => {
      opt.setName(o.name).setDescription(o.description).setRequired(!!o.required);
      if (o.type === 'int') opt.setMinValue(0).setMaxValue(1_000_000_000);
      if (o.type === 'string') opt.setMaxLength(1000);
      return opt;
    });
  }

  async function handle(ctx) {
    try {
      if (perms.length && !ctx.member?.permissions.has(perms)) return await ctx.reply({ content: '⛔ No tienes permisos para usar este comando.', ephemeral: true });
      if (module) {
        const st = await getModuleState(ctx.guild.id, module);
        if (!st.enabled) return await ctx.reply({ content: '⛔ Este módulo está desactivado en este servidor.', ephemeral: true });
      }
      await run(ctx);
    } catch (e) {
      if (e instanceof EconomyError) return ctx.reply({ embeds: [embed('⚠️ No se pudo', e.message, 0xf87171)], ephemeral: true }).catch(() => {});
      logger.error(`Comando ${name}:`, e);
      await ctx.reply({ content: '❌ Ocurrió un error ejecutando el comando.', ephemeral: true }).catch(() => {});
    }
  }

  return {
    data, prefix: name, aliases,
    async execute(i) {
      const args = {};
      for (const o of options) {
        args[o.name] = o.type === 'user' ? i.options.getUser(o.name) : o.type === 'int' ? i.options.getInteger(o.name) : i.options.getString(o.name);
      }
      if (defer && !i.deferred && !i.replied) await i.deferReply({ ephemeral: defer === 'ephemeral' });
      await handle({
        client: i.client, guild: i.guild, user: i.user, member: i.member, channel: i.channel, args,
        reply: ({ ephemeral, ...p }) => {
          if (i.deferred && !i.replied) return i.editReply(p);
          return i.replied || i.deferred ? i.followUp({ ...p, ephemeral }) : i.reply({ ...p, ephemeral });
        },
      });
    },
    async executePrefix(m, tokens) {
      const args = {};
      for (const [idx, o] of options.entries()) {
        const tok = tokens.shift();
        if (o.type === 'user') { const mt = tok?.match(ID); args[o.name] = mt ? await m.client.users.fetch(mt[1] ?? mt[2]).catch(() => null) : null; }
        else if (o.type === 'int') args[o.name] = tok && /^\d+$/.test(tok) ? Number(tok) : null;
        else if (idx === options.length - 1) args[o.name] = [tok, ...tokens].filter(Boolean).join(' ') || null;
        else args[o.name] = tok ?? null;
        if (o.required && args[o.name] == null) {
          return m.reply({ content: `Uso: \`.${name} ${options.map((x) => (x.required ? `<${x.name}>` : `[${x.name}]`)).join(' ')}\``, allowedMentions: { repliedUser: false } });
        }
      }
      await handle({
        client: m.client, guild: m.guild, user: m.author, member: m.member, channel: m.channel, args,
        reply: ({ ephemeral, ...p }) => m.reply({ ...p, allowedMentions: { repliedUser: false, parse: [] } }),
      });
    },
  };
}
