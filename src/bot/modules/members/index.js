import { Events } from 'discord.js';
import { getModuleState } from '../../../services/guilds.js';
import { trackJoin, markLeft, stats, checkRewards } from '../../../services/invites.js';
import { isWhitelisted } from '../../../services/whitelist.js';
import { sendWelcome } from '../../../services/welcome.js';
import { emitLog } from '../../../lib/bus.js';
import { logger } from '../../../lib/logger.js';

// Orquesta lo que pasa cuando alguien entra o sale, siempre en el mismo orden.
export default {
  commands: [],
  events: [
    {
      name: Events.GuildMemberAdd,
      async execute(_client, member) {
        const g = member.guild;
        const ar = await getModuleState(g.id, 'autorol_bienvenida');
        if (member.user.bot) {
          if (ar.enabled && ar.config.botRoleId) await member.roles.add(ar.config.botRoleId, 'Autorol de bots').catch(() => {});
          return;
        }
        const { inviterId } = await trackJoin(member);

        const wl = await getModuleState(g.id, 'whitelist');
        if (wl.enabled) {
          const ok = await isWhitelisted(g.id, member.id);
          if (ok && wl.config.whitelistRoleId) await member.roles.add(wl.config.whitelistRoleId, 'Whitelist').catch(() => {});
          if (!ok && wl.config.kickNonWhitelisted) {
            await member.send(wl.config.kickMessage).catch(() => {});
            await member.kick('No está en la whitelist').catch((e) => logger.warn('Whitelist kick:', e.message));
            emitLog(g.id, 'mod_action', { title: '🚪 Expulsado por whitelist', description: `<@${member.id}> (${member.user.tag}) no estaba en la whitelist.`, color: 0xf87171 });
            return;
          }
        }

        if (ar.enabled && ar.config.humanRoleIds.length) {
          const give = () => member.roles.add(ar.config.humanRoleIds, 'Autorol de bienvenida').catch((e) => logger.warn('Autorol:', e.message));
          if (ar.config.delaySeconds > 0) setTimeout(give, ar.config.delaySeconds * 1000); else await give();
        }

        const wc = await getModuleState(g.id, 'bienvenidas');
        if (wc.enabled) {
          const inviterInvites = inviterId ? (await stats(g.id, inviterId)).valid : 0;
          await sendWelcome('bienvenidas', wc.config, member, { inviterId, inviterInvites }).catch((e) => logger.warn('Bienvenida:', e.message));
        }
        emitLog(g.id, 'member_join', {
          title: '📥 Miembro nuevo', color: 0x34d399,
          description: `<@${member.id}> (${member.user.tag})${inviterId ? `\nInvitado por <@${inviterId}>` : ''}\nCuenta creada <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        });
        if (inviterId) checkRewards(g, inviterId).catch(() => {});
      },
    },
    {
      name: Events.GuildMemberRemove,
      async execute(_client, member) {
        const g = member.guild;
        if (member.user.bot) return;
        await markLeft(g.id, member.id).catch(() => {});
        const dc = await getModuleState(g.id, 'despedidas');
        if (dc.enabled) await sendWelcome('despedidas', dc.config, member).catch((e) => logger.warn('Despedida:', e.message));
        emitLog(g.id, 'member_leave', { title: '📤 Miembro salió', color: 0xf87171, description: `<@${member.id}> (${member.user.tag})` });
      },
    },
  ],
};
