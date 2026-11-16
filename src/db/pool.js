import pg from 'pg';
import { config } from '../config.js';

// La URL externa de Render (*.render.com) exige SSL; la interna no.
const ssl = config.databaseUrl.includes('.render.com') ? { rejectUnauthorized: false } : false;
export const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl, max: 10 });
export const query = (text, params) => pool.query(text, params);

export async function withTx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
