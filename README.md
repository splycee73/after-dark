# AFTER DARK — Bot de Discord + Dashboard

Un solo servicio Node.js (bot + API + dashboard) y una base PostgreSQL. Pensado para Render.

## Estructura
- `src/bot/` → discord.js. Cada carpeta de `src/bot/modules/<x>/index.js` exporta `{ commands, events }` y se carga sola.
- `src/web/` → Express: OAuth2 de Discord, API REST (`api.js`, `extras.js`, `extras2.js`), sesiones en Postgres.
- `src/services/` → lógica compartida por bot y web. `schemas.js` define la config de cada módulo (la usan el bot, la validación y los formularios del dashboard).
- `src/db/migrations/` → SQL versionado; se aplica solo al arrancar.
- `public/` → dashboard (HTML/CSS/JS sin build).

## Módulos
Stats · Personalización (presencia) · Economía · Store · Contador · Tickets · Logs · Alertas · Moderación · Whitelist ·
Invites · Bienvenidas · Despedidas · Autoroles · Autorol de bienvenida · Sugerencias · Embeds · IA · Manga · Anime +18.
Todos arrancan **desactivados**: actívalos en el dashboard (interruptor "Activado" + Guardar cambios).

## Local
`cp .env.example .env` → rellenar → `npm install` → `npm start`

## Render
Web Service (Node, build `npm install`, start `npm start`, health check `/health`) + PostgreSQL. Variables en `.env.example`.
`ANTHROPIC_API_KEY` solo es necesaria para el módulo IA.

## Permisos del bot en cada servidor
Administrar roles, canales, apodos, expulsar/banear, aislar miembros, gestionar mensajes, ver registro de invitaciones
(Gestionar servidor) y enviar mensajes/embeds. Lo más simple: invitarlo con el permiso Administrador y colocar su rol por encima de los roles que deba gestionar.
