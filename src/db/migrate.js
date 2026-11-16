import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  const c = await pool.connect();
  try {
    // Un solo proceso migra a la vez (por si Render arranca dos instancias en un despliegue).
    await c.query('SELECT pg_advisory_lock(727274)');
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${config.dbSchema}`);
    await c.query(`SET search_path TO ${config.dbSchema}, public`);
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      try {
        await c.query('BEGIN');
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations(name) VALUES($1)', [f]);
        await c.query('COMMIT');
        logger.info(`Migración aplicada: ${f} (esquema ${config.dbSchema})`);
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw new Error(`Falló la migración ${f}: ${e.message}`);
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    c.release();
  }
}
