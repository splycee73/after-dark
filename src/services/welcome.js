import { buildMessage, render } from './messages.js';

// Envía la bienvenida o despedida. kind: 'bienvenidas' | 'despedidas'. Lo usan el bot y el botón "Probar" del dashboard.
export async function sendWelcome(kind, cfg, member, { inviterId = null, inviterInvites = 0 } = {}) {
  const g = member.guild;
  const vars = {
    user: `<@${member.id}>`, username: member.user.username, server: g.name, memberCount: g.memberCount,
    inviter: inviterId ? `<@${inviterId}>` : 'alguien', inviterInvites,
  };
  const ch = cfg.channelId && g.channels.cache.get(cfg.channelId);
  if (ch?.isTextBased()) {
    await ch.send({ ...buildMessage(cfg, vars, member.user.displayAvatarURL({ size: 256 })), allowedMentions: { users: [member.id] } });
  }
  if (kind === 'bienvenidas' && cfg.dmEnabled && cfg.dmMessage) await member.send(render(cfg.dmMessage, vars)).catch(() => {});
  return !!ch;
}
