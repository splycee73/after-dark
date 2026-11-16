import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { router as auth } from './auth.js';
import { createApi } from './api.js';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

export function createServer(client) {
  const app = express();
  app.set('trust proxy', 1); // Render está detrás de un proxy
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https:'],
    styleSrc: ["'self'"], styleSrcAttr: ["'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"],
  } } }));
  app.use(express.json({ limit: '50kb' }));

  // Health check: lo usan Render y UptimeRobot.
  app.get('/health', async (_req, res) => {
    let db = false;
    try { await pool.query('SELECT 1'); db = true; } catch { /* db caída */ }
    res.status(db ? 200 : 503).json({ ok: db, db, bot: client.isReady(), guilds: client.guilds.cache.size });
  });

  const PgStore = connectPg(session);
  app.use(session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: config.sessionSecret, resave: false, saveUninitialized: false, name: 'ad.sid',
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', maxAge: 7 * 24 * 3600 * 1000 },
  }));

  // Protección CSRF básica: las escrituras solo se aceptan desde nuestro propio origen.
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== config.baseUrl) return res.status(403).json({ error: 'Origen no permitido' });
    next();
  });

  app.use('/auth', rateLimit({ windowMs: 60_000, limit: 30 }), auth);
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 180 }), createApi(client));
  app.use(express.static(pub));
  app.use((err, _req, res, _next) => { logger.error('Web:', err); res.status(500).json({ error: 'Error interno' }); });
  return app;
}
