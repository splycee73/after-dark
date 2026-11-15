import { defineCommand, embed, fmtDuration } from '../../lib/command.js';
import { getModuleState } from '../../../services/guilds.js';
import { EconomyError, credit, getBalance, claimCooldown, transfer, rob, leaderboard, history } from '../../../services/economy.js';

const M = 'economia';
const cfgOf = async (ctx) => (await getModuleState(ctx.guild.id, M)).config;
const money = (c, n) => `${c.currencySymbol} **${Number(n).toLocaleString('es-ES')}** ${c.currencyName}`;
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const WORK = ['Repartiste pedidos toda la noche', 'Moderaste un servidor caótico', 'Programaste un bot sin dormir', 'Atendiste la barra de After Dark', 'Hiciste de DJ en una fiesta privada'];

async function cooldown(ctx, action, seconds) {
  const r = await claimCooldown(ctx.guild.id, ctx.user.id, action, seconds);
  if (!r.ok) throw new EconomyError(`Debes esperar **${fmtDuration(r.remaining)}** para usar esto de nuevo.`);
}

const balance = defineCommand({
  name: 'balance', description: 'Consulta tu saldo', module: M, aliases: ['bal', 'money'],
  options: [{ name: 'usuario', type: 'user', description: 'Usuario a consultar' }],
  async run(ctx) {
    const c = await cfgOf(ctx); const t = ctx.args.usuario ?? ctx.user;
    const b = await getBalance(ctx.guild.id, t.id, c.startBalance);
    await ctx.reply({ embeds: [embed(`Saldo de ${t.displayName ?? t.username}`, money(c, b))] });
  },
});

const reward = (name, descr, key, cdKey, amountOf) => defineCommand({
  name, description: descr, module: M,
  async run(ctx) {
    const c = await cfgOf(ctx);
    await cooldown(ctx, name, c[cdKey]);
    const amount = amountOf(c);
    const b = await credit(ctx.guild.id, ctx.user.id, amount, name, { start: c.startBalance });
    await ctx.reply({ embeds: [embed(key(), `Ganaste ${money(c, amount)}\nSaldo: ${money(c, b)}`)] });
  },
});
const work = reward('work', 'Trabaja y recibe una recompensa', () => `💼 ${WORK[rand(0, WORK.length - 1)]}`, 'workCooldown', (c) => rand(c.workMin, c.workMax));
const daily = reward('daily', 'Reclama tu recompensa diaria', () => '🎁 Recompensa diaria', 'dailyCooldown', (c) => c.dailyAmount);
const weekly = reward('weekly', 'Reclama tu recompensa semanal', () => '🎉 Recompensa semanal', 'weeklyCooldown', (c) => c.weeklyAmount);

const pay = defineCommand({
  name: 'pay', description: 'Transfiere dinero a otro usuario', module: M,
  options: [{ name: 'usuario', type: 'user', description: 'Destinatario', required: true }, { name: 'cantidad', type: 'int', description: 'Cantidad', required: true }],
  async run(ctx) {
    const c = await cfgOf(ctx); const to = ctx.args.usuario;
    if (to.bot || to.id === ctx.user.id) throw new EconomyError('Elige a otra persona (no bots ni a ti mismo).');
    await transfer(ctx.guild.id, ctx.user.id, to.id, ctx.args.cantidad, c.startBalance);
    await ctx.reply({ embeds: [embed('💸 Transferencia', `Enviaste ${money(c, ctx.args.cantidad)} a <@${to.id}>`)] });
  },
});

const robCmd = defineCommand({
  name: 'rob', description: 'Intenta robarle dinero a otro usuario', module: M,
  options: [{ name: 'usuario', type: 'user', description: 'Víctima', required: true }],
  async run(ctx) {
    const c = await cfgOf(ctx); const v = ctx.args.usuario;
    if (!c.robEnabled) throw new EconomyError('Los robos están desactivados en este servidor.');
    if (v.bot || v.id === ctx.user.id) throw new EconomyError('No puedes robarte a ti mismo ni a un bot.');
    await cooldown(ctx, 'rob', c.robCooldown);
    const r = await rob(ctx.guild.id, ctx.user.id, v.id, c);
    await ctx.reply(r.success
      ? { embeds: [embed('🦹 ¡Robo exitoso!', `Le quitaste ${money(c, r.amount)} a <@${v.id}>`)] }
      : { embeds: [embed('🚨 Te atraparon', r.amount ? `Pagaste una multa de ${money(c, r.amount)} a <@${v.id}>` : 'Escapaste sin perder nada.', 0xf87171)] });
  },
});

const top = defineCommand({
  name: 'top', description: 'Ranking de riqueza', module: M, aliases: ['leaderboard', 'lb'],
  async run(ctx) {
    const c = await cfgOf(ctx); const rows = await leaderboard(ctx.guild.id, 10);
    const medal = ['🥇', '🥈', '🥉'];
    await ctx.reply({ embeds: [embed('🏆 Ranking de riqueza', rows.length ? rows.map((r, i) => `${medal[i] ?? `**${i + 1}.**`} <@${r.userId}> — ${money(c, r.balance)}`).join('\n') : 'Aún no hay datos.')] });
  },
});

const hist = defineCommand({
  name: 'history', description: 'Tus últimas transacciones', module: M, aliases: ['hist'],
  async run(ctx) {
    const c = await cfgOf(ctx); const rows = await history(ctx.guild.id, ctx.user.id, 10);
    await ctx.reply({ embeds: [embed('📒 Historial', rows.length ? rows.map((r) => `${r.amount >= 0 ? '🟢 +' : '🔴 '}${r.amount.toLocaleString('es-ES')} ${c.currencySymbol} · ${r.type}${r.note ? ` (${r.note})` : ''} · <t:${Math.floor(new Date(r.at) / 1000)}:R>`).join('\n') : 'Sin movimientos.')], ephemeral: true });
  },
});

export default { commands: [balance, work, daily, weekly, pay, robCmd, top, hist], events: [] };
