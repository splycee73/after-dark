import 'dotenv/config';

const req = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta la variable de entorno: ${k}`);
  return v;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  baseUrl: req('BASE_URL').replace(/\/$/, ''),
  databaseUrl: req('DATABASE_URL'),
  sessionSecret: req('SESSION_SECRET'),
  prefix: process.env.PREFIX || '.',
  ownerIds: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  discord: {
    token: req('DISCORD_TOKEN'),
    clientId: req('DISCORD_CLIENT_ID'),
    clientSecret: req('DISCORD_CLIENT_SECRET'),
  },
};
