# Contexto de sesion - api-ayudas

Ultima actualizacion: 2026-04-08

Proyecto: app interna **Buscador de Ayudas** (titulo de pestaña y producto) para busqueda de convocatorias BDNS, sin cuentas de usuario.

## Estado actual (hecho)

1. **Base:** Next.js + TypeScript en `web`, Docker Compose (`app`, `db`, `scheduler`), PostgreSQL, healthcheck.

2. **BFF BDNS:** busqueda (`BDNS_SEARCH_ENDPOINT`) y detalle / catalogos usando URLs basadas en `BDNS_BASE_URL` (ver README). Filtros y CCAA vía catalogo de regiones.

3. **UI:** listado con filtros, detalle en **modal**, cabecera del sitio con titulo documentado en `web/src/app/layout.tsx` (**«Buscador de Ayudas»**, `lang="es"`). Gestion de **perfiles de alerta** en modal **«Gestionar alertas»**.

4. **Destinatarios de resumenes (email + Telegram):**
   - Tabla `notification_recipients` (canal `email` | `telegram`, `address`, `label`, `enabled`).
   - API: `GET/POST /api/settings/notification-recipients`, `PUT/DELETE .../[id]`.
   - Modal de alertas: seccion **«Destinatarios del resumen»** (varios correos y varios chat ID).
   - **Regla de envio:** si hay ≥ 1 fila **activa** en BD para ese canal → solo BD; si no hay ninguna → **fallback** `ALERT_RECIPIENTS` / `TELEGRAM_CHAT_ID` en `.env`.
   - **SMTP** y **token del bot** solo en entorno (no en tabla).

5. **Job de alertas:** `runWeeklyAlerts` (`weekly-runner.ts`), deduplicacion `grants_snapshot`, historial `alerts_history`, envio en paralelo email + Telegram con **timeout por canal** (`ALERTS_CHANNEL_TIMEOUT_MS`). **Candado** anti-concurrencia y **rate limit** (~10 s) en `POST /api/alerts/weekly/run`. **Logs** JSON (`weekly_run_*`).
   - Textos del digest: `src/lib/alerts/digest-copy.ts` + `ALERTS_DIGEST_PERIOD` (p. ej. diario). Tras cambios de servidor, si la pestaña o bundles muestran texto viejo: `docker compose restart app` o `up -d --force-recreate app` (caché `.next` en volumen).

6. **Documentacion en repo:** `web/README.md` operativo; plan en `.cursor/plans/plan_interno_ayudas_docker_bebc1756.plan.md`.

## Plan / bloques

- Bloques **1–5** y **destinatarios multi** del plan: **completados**.
- **Bloque 6 (hardening):** **parcial** — ya hay validacion basica en APIs, rate limit del job, logs estructurados, timeouts; **pendiente** p. ej. reintentos por canal y caché BDNS si se prioriza.
- **Bloque 7:** pendiente (evolucion comercial / multi-tenant sin implementar aun).

## Regla de trabajo acordada con el usuario

- Formato preferido para cambios guiados: **como esta / que sustituir / donde**.
- Los **commits** los ejecuta normalmente **el usuario**; puede pedir que los haga el asistente de forma explicita.
