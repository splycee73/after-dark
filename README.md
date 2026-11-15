# AFTER DARK — Bot de Discord + Dashboard

## Arquitectura
Un solo servicio Node.js (bot + API + dashboard) y PostgreSQL.
- `src/bot/modules/<modulo>/index.js`: comandos y eventos Discord.js cargados automáticamente.
- `src/web/`: Express, OAuth2 de Discord, API REST y sesiones PostgreSQL.
- `src/services/`: lógica compartida entre bot y dashboard.
- `src/db/migrations/`: migraciones SQL versionadas que se aplican al arrancar.
- `public/`: dashboard web.

## Sistemas
- [x] Arquitectura, OAuth2, multiservidor, presencia y estadísticas.
- [x] Economía: `.work`, `.daily`, `.weekly`, `.rob`, `.pay`, `.balance`, `.top`, `.history`.
- [x] Store: `.store`, `.buy`, artículos, roles temporales e inventario.
- [x] Contador configurable.
- [x] Tickets privados: `.ticket` y `.close`, registro y panel de actividad.
- [x] Logs: mensajes editados/eliminados, miembros, canales y baneos.
- [x] Alertas: picos de entradas y menciones masivas (detección y aviso, no bloqueo automático).
- [ ] Moderación avanzada y whitelist.
- [ ] Invitaciones, bienvenidas, despedidas, autoroles y sugerencias.
- [ ] Embeds e IA.
- [ ] Anime y manga.

## Configuración local
1. Copia `.env.example` a `.env` y completa las variables.
2. Ejecuta `npm install`.
3. Ejecuta `npm start`.

## Render
Usa `render.yaml` como Blueprint o configura el servicio Node con `npm install` y `npm start`. Define las variables del bot y OAuth2 en Render. UptimeRobot debe consultar `/health`.

## Discord Developer Portal
En **Bot → Privileged Gateway Intents**, activa **Server Members Intent** y **Message Content Intent**. Son necesarios para eventos de miembros, mensajes con prefijo, contador y algunas funciones de logs/alertas. Consulta la [documentación oficial de Gateway Intents](https://discord.com/developers/docs/events/gateway#gateway-intents).
