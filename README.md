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


## Variables de entorno

Para desarrollo local, copia `.env.example` a `.env` y completa los datos reales. No subas nunca `.env` ni compartas el token del bot o el secreto OAuth.

En Render configura `BASE_URL` con la URL pública del servicio (por ejemplo, `https://tu-servicio.onrender.com`) y registra exactamente `https://tu-servicio.onrender.com/auth/callback` como Redirect URI en el portal de Discord. Render puede crear la base de datos desde `render.yaml`; confirma que `DATABASE_URL` esté enlazada al servicio.

## Intents de Discord

En Discord Developer Portal → Bot → Privileged Gateway Intents, activa **Server Members Intent** y **Message Content Intent** para que funcionen las funciones que dependen de miembros y comandos con prefijo. El bot también solicita Guild Invites para futuras funciones de invitaciones. Concede en cada servidor únicamente los permisos que necesiten los módulos que habilites; evita dar Administrator si no es imprescindible.

## Estado real de implementación

El dashboard actualmente tiene funcionales los módulos Stats, Personalización, Economía, Store y Contador. Los demás apartados son marcadores de módulos pendientes y todavía no deben considerarse funciones operativas. Las siguientes etapas requieren implementar sus eventos, comandos, validaciones y controles desde el dashboard.
