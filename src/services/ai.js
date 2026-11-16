import { config } from '../config.js';
import { query } from '../db/pool.js';

export const provider = () => (config.anthropicApiKey ? 'anthropic' : config.geminiApiKey ? 'gemini' : null);
export const aiConfigured = () => provider() !== null;

async function viaAnthropic({ model, system, messages, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model.startsWith('gemini') ? 'claude-haiku-5-5' : model, max_tokens: maxTokens, system, messages }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${j?.error?.message ?? 'error'}`);
  return (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

async function viaGemini({ model, system, messages, maxTokens }) {
  const m = model.startsWith('gemini') ? model : 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${j?.error?.message ?? 'error'}`);
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
}

// Usa Anthropic si hay ANTHROPIC_API_KEY; si no, Gemini (gratuito) con GEMINI_API_KEY.
export const askAI = (opts) => (provider() === 'anthropic' ? viaAnthropic(opts) : viaGemini(opts));

// Cuenta un uso diario de forma atómica. Devuelve false si se superó el límite.
export async function takeDailyUse(g, u, limit) {
  if (limit <= 0) return true;
  const { rowCount } = await query(
    `INSERT INTO ai_usage (guild_id, user_id, day, count) VALUES ($1,$2,CURRENT_DATE,1)
     ON CONFLICT (guild_id, user_id, day) DO UPDATE SET count = ai_usage.count + 1 WHERE ai_usage.count < $3`, [g, u, limit]);
  return rowCount > 0;
}
export async function usageToday(g) {
  const { rows: [r] } = await query('SELECT COALESCE(SUM(count),0)::int AS n, COUNT(*)::int AS users FROM ai_usage WHERE guild_id=$1 AND day=CURRENT_DATE', [g]);
  return { messages: r.n, users: r.users };
}
