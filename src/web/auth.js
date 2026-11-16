import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

const API = 'https://discord.com/api/v10';
const redirectUri = `${config.baseUrl}/auth/callback`;
export const router = Router();

router.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config.discord.clientId, response_type: 'code', scope: 'identify guilds',
    redirect_uri: redirectUri, state, prompt: 'none',
  });
  req.session.save(() => res.redirect(url.toString()));
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) return res.status(400).send('Estado OAuth inválido. Vuelve a intentarlo.');
    delete req.session.oauthState;
    const tok = await fetch(`${API}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId, client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri,
      }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error('Discord no devolvió access_token');
    const headers = { Authorization: `Bearer ${tok.access_token}` };
    const [user, guilds] = await Promise.all([
      fetch(`${API}/users/@me`, { headers }).then((r) => r.json()),
      fetch(`${API}/users/@me/guilds`, { headers }).then((r) => r.json()),
    ]);
    // Solo guardamos servidores donde el usuario es dueño, admin o tiene "Gestionar servidor".
    const manageable = guilds
      .filter((g) => g.owner || (BigInt(g.permissions) & 0x8n) || (BigInt(g.permissions) & 0x20n))
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
    req.session.user = { id: user.id, username: user.global_name || user.username, avatar: user.avatar, guilds: manageable };
    req.session.save(() => res.redirect('/'));
  } catch (e) {
    logger.error('OAuth callback:', e);
    res.status(500).send('Error al iniciar sesión.');
  }
});

router.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
