import { Events } from 'discord.js';
import { defineCommand, embed, fmtDuration } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { listItems, buyItem, sweepTempRoles } from '../../../services/store.js';
import { logger } from '../../../lib/logger.js';

const eco = async (ctx) => (await getModuleState(ctx.guild.id, 'economia')).config;
const ICON = { role: '🏷️', nickname: '✏️', item: '🎒' };

const store = defineCommand({
  name: 'store', description: 'Mira la tienda del servidor', module: 'store', aliases: ['tienda', 'shop'],
  async run(ctx) {
    const c = await eco(ctx); const items = await listItems(ctx.guild.id, { onlyEnabled: true });
    const lines = items.map((i) => {
      const extra = [i.type === 'role' && i.durationSeconds ? `⏳ ${fmtDuration(i.durationSeconds)}` : null,
        i.stock !== null ? `stock ${i.stock}` : null, i.requiredRoleId ? `requiere <@&${i.requiredRoleId}>` : null].filter(Boolean).join(' · ');
      return `${ICON[i.type]} **${i.name}** · ID \`${i.id}\` · ${c.currencySymbol} **${i.price.toLocaleString('es-ES')}**${extra ? `\n└ ${extra}` : ''}${i.description ? `\n└ ${i.description}` : ''}`;
    });
    await ctx.reply({ embeds: [embed('🛒 Tienda', lines.length ? `${lines.join('\n\n')}\n\nCompra con \`/buy\` o \`.buy <id>\`` : 'La tienda está vacía.')] });
  },
});

const buy = defineCommand({
  name: 'buy', description: 'Compra un artículo de la tienda', module: 'store', aliases: ['comprar'],
  options: [{ name: 'articulo', type: 'string', description: 'ID o nombre del artículo', required: true },
    { name: 'apodo', type: 'string', description: 'Apodo deseado (solo para artículos de apodo)' }],
  async run(ctx) {
    const c = await eco(ctx);
    const { item, balance } = await buyItem({ guild: ctx.guild, member: ctx.member, ref: ctx.args.articulo, nickname: ctx.args.apodo, start: c.startBalance });
    await ctx.reply({ embeds: [embed('✅ Compra realizada', `Compraste **${item.name}** por ${c.currencySymbol} **${item.price.toLocaleString('es-ES')}**\nSaldo: ${c.currencySymbol} **${balance.toLocaleString('es-ES')}**`)] });
  },
});

export default {
  commands: [store, buy],
  events: [{
    name: Events.ClientReady, once: true,
    async execute(client) {
      const tick = () => sweepTempRoles(client).catch((e) => logger.error('Roles temporales:', e));
      tick(); setInterval(tick, 60_000);
    },
  }],
};
