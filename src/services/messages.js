import { EmbedBuilder } from 'discord.js';

export const render = (t, v) => String(t ?? '').replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));
export const hexToInt = (h, d = 0x8b5cf6) => (/^#[0-9a-f]{6}$/i.test(h ?? '') ? parseInt(h.slice(1), 16) : d);

// Construye el mensaje de bienvenida/despedida desde la config del módulo.
export function buildMessage(cfg, vars, avatarUrl) {
  const content = cfg.message ? render(cfg.message, vars) : undefined;
  if (!cfg.useEmbed) return { content: content || '\u200b' };
  const e = new EmbedBuilder().setColor(hexToInt(cfg.embedColor)).setDescription(render(cfg.embedDescription, vars) || '\u200b');
  if (cfg.embedTitle) e.setTitle(render(cfg.embedTitle, vars).slice(0, 256));
  if (cfg.imageUrl) e.setImage(cfg.imageUrl);
  if (cfg.thumbnailAvatar && avatarUrl) e.setThumbnail(avatarUrl);
  if (cfg.footer) e.setFooter({ text: render(cfg.footer, vars).slice(0, 2048) });
  return { content, embeds: [e] };
}
