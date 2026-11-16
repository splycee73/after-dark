import { config } from '../config.js';
import { query } from '../db/pool.js';

export const aiConfigured = () => !!config.anthropicApiKey;

export async function askClaude({ model, system, messages, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${j?.error?.message ?? 'error'}`);
  return (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

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
