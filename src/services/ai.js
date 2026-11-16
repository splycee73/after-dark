import { config } from '../config.js';
import { query } from '../db/pool.js';

// After Dark utiliza exclusivamente Gemini.
export const provider = () => (config.geminiApiKey ? 'gemini' : null);
export const aiConfigured = () => Boolean(config.geminiApiKey);

async function viaGemini({ model, system, messages, maxTokens }) {
  if (!config.geminiApiKey) {
    throw new Error('Falta configurar GEMINI_API_KEY en las variables de entorno.');
  }

  const requestedModel = typeof model === 'string' ? model : '';
  const m = requestedModel.startsWith('gemini') ? requestedModel : 'gemini-3.8-flash';

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.geminiApiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system || '' }] },
      contents: messages.map((x) => ({
        role: x.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: x.content }],
      })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${j?.error?.message ?? 'error'}`);
  }

  const answer = (j.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!answer) {
    throw new Error('Gemini no devolvió una respuesta de texto.');
  }

  return answer;
}

export const askAI = (opts) => viaGemini(opts);

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
