# AFTER DARK — Bot de Discord + Dashboard

## Arquitectura (Etapa 1)
Un solo servicio Node.js (bot + API + dashboard) y una base PostgreSQL.
- `src/bot/` → discord.js. Cada carpeta de `src/bot/modules/<x>/` exporta `{ commands, events }` y se carga sola.
- `src/web/` → Express: OAuth2 de Discord, API REST, sesiones en Postgres.
- `src/services/` → lógica compartida por bot y web (el bot ve al instante lo que guarda el dashboard).
- `src/db/migrations/` → SQL versionado, se aplica solo al arrancar.
- `public/` → dashboard (HTML/CSS/JS sin build).

## Etapas
1. Arquitectura, BD, login, multiservidor, presencia, stats ✅
2. Economía, Store, Contador ✅
3. Tickets, Logs, Alertas
4. Moderación, Whitelist, Invites, Bienvenidas, Despedidas, Autoroles, Sugerencias
5. Embeds, IA
6. Manga, Anime +18

## Local
`cp .env.example .env` → rellenar → `npm install` → `npm start`

## Render
Ver las instrucciones del chat. Opcional: `render.yaml` como Blueprint.
