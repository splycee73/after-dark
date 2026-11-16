// Publicación automática de Manga y Anime +18: programador, deduplicación y fuentes.
import { EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { query } from '../db/pool.js';
import { getModuleState } from './guilds.js';
import { EconomyError } from './economy.js';
import { hexToInt } from './messages.js';
import { logger } from '../lib/logger.js';

const UA = 'AfterDarkBot/1.0 (+discord bot)';
const getJson = async (url, headers = {}) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${new URL(url).host}`);
  return r.json();
};
const list = (s) => String(s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

// ---------- deduplicación y programador ----------
export async function alreadyPosted(g, module, key) {
  return (await query('SELECT 1 FROM posted_items WHERE guild_id=$1 AND module=$2 AND item_key=$3', [g, module, key])).rowCount > 0;
}
export const markPosted = (g, module, key) =>
  query('INSERT INTO posted_items (guild_id, module, item_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [g, module, key]);

export async function dueGuilds(client, module, cfgKey = 'intervalMinutes') {
  const due = [];
  for (const g of client.guilds.cache.values()) {
    const { enabled, config } = await getModuleState(g.id, module);
    if (!enabled || !config.channelId) continue;
    const { rows: [r] } = await query(
      `SELECT (last_run_at + make_interval(mins => $3::int) <= now()) AS due FROM module_runs WHERE guild_id=$1 AND module=$2`, [g.id, module, config[cfgKey]]);
    if (!r || r.due) due.push(g);
  }
  return due;
}
export const touchRun = (g, module) => query(
  `INSERT INTO module_runs (guild_id, module) VALUES ($1,$2) ON CONFLICT (guild_id, module) DO UPDATE SET last_run_at=now()`, [g, module]);

// ---------- MANGA: MangaDex ----------
const pickTitle = (t) => t?.es ?? t?.en ?? Object.values(t ?? {})[0] ?? 'Sin título';
export async function fetchMangadex(cfg, { title = null, limit = 25 } = {}) {
  const q = new URLSearchParams({ limit: String(limit), hasAvailableChapters: 'true' });
  q.append('includes[]', 'cover_art');
  q.append(title ? 'order[relevance]' : 'order[latestUploadedChapter]', 'desc');
  if (title) q.set('title', title);
  for (const l of list(cfg.languages).slice(0, 5)) q.append('availableTranslatedLanguage[]', l);
  for (const r of cfg.allowSuggestive ? ['safe', 'suggestive'] : ['safe']) q.append('contentRating[]', r);
  const j = await getJson(`https://api.mangadex.org/manga?${q}`);
  const inc = list(cfg.genres), exc = list(cfg.excludeGenres);
  return (j.data ?? []).map((m) => {
    const tags = (m.attributes.tags ?? []).map((t) => (t.attributes.name?.en ?? '').toLowerCase());
    const cover = m.relationships?.find((r) => r.type === 'cover_art')?.attributes?.fileName;
    return {
      id: m.id, chapterId: m.attributes.latestUploadedChapter, title: pickTitle(m.attributes.title), tags,
      description: (m.attributes.description?.es ?? m.attributes.description?.en ?? '').slice(0, 400),
      cover: cover ? `https://uploads.mangadex.org/covers/${m.id}/${cover}.512.jpg` : null, url: `https://mangadex.org/title/${m.id}`,
    };
  }).filter((m) => (!inc.length || inc.some((g) => m.tags.includes(g))) && !exc.some((g) => m.tags.includes(g)));
}

async function chapterInfo(id) {
  if (!id) return null;
  try { const j = await getJson(`https://api.mangadex.org/chapter/${id}`); return { number: j.data.attributes.chapter, title: j.data.attributes.title, lang: j.data.attributes.translatedLanguage, url: `https://mangadex.org/chapter/${id}` }; }
  catch { return null; }
}

// ---------- MANGA: RSS ----------
const unesc = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (x, t) => x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i'))?.[1] ?? '';
export async function fetchRss(feedUrl) {
  const r = await fetch(feedUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`RSS HTTP ${r.status}`);
  const xml = (await r.text()).slice(0, 1_500_000);
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].slice(0, 15).map((m) => {
    const x = m[0];
    const link = unesc(tag(x, 'link')) || x.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '';
    return {
      id: unesc(tag(x, 'guid')) || link, title: unesc(tag(x, 'title')).slice(0, 250), url: /^https:\/\//.test(link) ? link : null,
      description: unesc(tag(x, 'description')).slice(0, 400), cover: x.match(/<enclosure[^>]+url="(https:[^"]+)"/i)?.[1] ?? x.match(/<media:content[^>]+url="(https:[^"]+)"/i)?.[1] ?? null,
    };
  }).filter((i) => i.id && i.title);
}

export async function runManga(client, guild, { force = false } = {}) {
  const { enabled, config: cfg } = await getModuleState(guild.id, 'manga');
  if (!enabled) throw new EconomyError('El módulo Manga está desactivado.');
  const ch = cfg.channelId && guild.channels.cache.get(cfg.channelId);
  if (!ch?.isTextBased()) throw new EconomyError('Configura un canal de publicación.');
  const firstRun = (await query("SELECT 1 FROM posted_items WHERE guild_id=$1 AND module='manga' LIMIT 1", [guild.id])).rowCount === 0;
  const items = [];
  if (cfg.useMangadex) items.push(...(await fetchMangadex(cfg).catch((e) => { logger.warn('MangaDex:', e.message); return []; })).map((m) => ({ ...m, key: `md:${m.id}:${m.chapterId}`, kind: 'md' })));
  for (const u of String(cfg.rssUrls).split('\n').map((x) => x.trim()).filter((x) => /^https:\/\/\S+$/.test(x)).slice(0, 5)) {
    items.push(...(await fetchRss(u).catch((e) => { logger.warn(`RSS ${u}:`, e.message); return []; })).map((i) => ({ ...i, key: `rss:${i.id}`, kind: 'rss' })));
  }
  const fresh = [];
  for (const it of items) if (!(await alreadyPosted(guild.id, 'manga', it.key))) fresh.push(it);
  const toPost = fresh.slice(0, cfg.maxPerRun).reverse();
  // En la primera ejecución no inundamos el canal: lo demás se marca como visto.
  if (firstRun && !force) for (const it of fresh.slice(cfg.maxPerRun)) await markPosted(guild.id, 'manga', it.key);
  let posted = 0;
  for (const it of toPost) {
    const e = new EmbedBuilder().setColor(hexToInt(cfg.embedColor)).setTitle(it.title.slice(0, 256)).setTimestamp();
    if (it.kind === 'md') {
      const info = await chapterInfo(it.chapterId);
      e.setURL(info?.url ?? it.url).setAuthor({ name: 'MangaDex' });
      if (info) e.addFields({ name: 'Capítulo', value: `${info.number ?? '—'}${info.title ? ` · ${info.title}` : ''}`.slice(0, 1024), inline: true }, { name: 'Idioma', value: info.lang ?? '—', inline: true });
      if (it.tags.length) e.addFields({ name: 'Géneros', value: it.tags.slice(0, 6).join(', ') });
    } else if (it.url) e.setURL(it.url).setAuthor({ name: 'RSS' });
    if (cfg.showDescription && it.description) e.setDescription(it.description);
    if (it.cover) e.setImage(it.cover);
    try {
      await ch.send({ content: cfg.pingRoleId ? `<@&${cfg.pingRoleId}>` : undefined, embeds: [e], allowedMentions: { roles: cfg.pingRoleId ? [cfg.pingRoleId] : [] } });
      await markPosted(guild.id, 'manga', it.key);
      posted++;
    } catch (err) { logger.warn(`Manga: no pude publicar en ${guild.name}: ${err.message}`); break; }
  }
  await touchRun(guild.id, 'manga');
  return posted;
}

// ---------- ANIME +18 ----------
// Lista dura: no se puede desactivar desde el dashboard. Se rechaza cualquier post con estas etiquetas.
const HARD_EXACT = new Set(['child', 'children', 'toddler', 'infant', 'baby', 'underage', 'preteen', 'young', 'younger', 'young_girl', 'young_boy',
  'kindergarten', 'elementary_school', 'elementary_school_student', 'randoseru', 'flat_chest', 'petite', 'little_girl', 'little_boy', 'aged_down',
  'age_regression', 'child_on_child', 'schoolgirl_uniform_child', 'middle_school_student', 'bikini_child']);
export const isBlockedTags = (tags, extra = []) =>
  tags.some((t) => HARD_EXACT.has(t) || t.includes('loli') || t.includes('shota') || extra.includes(t));

export async function fetchAnime18(cfg, extraTag = '') {
  const tagRaw = (extraTag || cfg.tag || '').toLowerCase().replace(/[^a-z0-9_()\-:]/g, '').slice(0, 40);
  const tags = [`rating:${cfg.rating === 'questionable' ? 'questionable' : 'explicit'}`, tagRaw].filter(Boolean).join(' ');
  const extra = list(cfg.excludedTags).map((t) => t.replace(/\s+/g, '_'));
  for (let i = 0; i < 8; i++) {
    const p = await getJson(`https://danbooru.donmai.us/posts/random.json?tags=${encodeURIComponent(tags)}`).catch(() => null);
    if (!p || p.is_banned || p.is_deleted) continue;
    const url = p.large_file_url || p.file_url;
    if (!url || !/\.(jpe?g|png|webp|gif)$/i.test(url)) continue;
    const all = String(p.tag_string ?? '').split(' ').filter(Boolean);
    if (isBlockedTags(all, extra)) continue;
    return { id: String(p.id), url, page: `https://danbooru.donmai.us/posts/${p.id}`, artist: String(p.tag_string_artist ?? '').split(' ')[0] || 'desconocido' };
  }
  return null;
}

export function anime18Embed(post, cfg) {
  return new EmbedBuilder().setColor(hexToInt(cfg.embedColor, 0xec4899)).setImage(post.url)
    .setDescription(`🎨 Artista: **${post.artist.replace(/_/g, ' ')}**\n[Fuente](${post.page})`).setFooter({ text: '🔞 Solo mayores de 18 años' });
}

export function assertAnime18Channel(guild, cfg, channel) {
  if (!channel?.nsfw) throw new EconomyError('Este contenido solo puede publicarse en canales restringidos por edad (NSFW).');
  if (!guild.members.me.permissionsIn(channel).has([P.SendMessages, P.EmbedLinks])) throw new EconomyError('El bot no puede escribir en ese canal.');
}

export async function runAnime18(client, guild, { force = false } = {}) {
  const { enabled, config: cfg } = await getModuleState(guild.id, 'anime18');
  if (!enabled) throw new EconomyError('El módulo Anime +18 está desactivado.');
  if (!force && !cfg.autoPost) return 0;
  const ch = cfg.channelId && guild.channels.cache.get(cfg.channelId);
  if (!ch?.isTextBased()) throw new EconomyError('Configura un canal NSFW de publicación.');
  assertAnime18Channel(guild, cfg, ch);
  let posted = 0;
  for (let i = 0; i < cfg.postsPerRun; i++) {
    const post = await fetchAnime18(cfg);
    if (!post || await alreadyPosted(guild.id, 'anime18', post.id)) continue;
    await ch.send({ embeds: [anime18Embed(post, cfg)] });
    await markPosted(guild.id, 'anime18', post.id);
    posted++;
  }
  await touchRun(guild.id, 'anime18');
  return posted;
}
