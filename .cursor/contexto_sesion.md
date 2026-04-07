# Contexto de sesion - api-ayudas

Ultima actualizacion: 2026-04-07

Proyecto: app interna para busqueda de ayudas BDNS, sin cuentas de usuario.

## Estado actual (hecho)

1. **Base:** Next.js + TypeScript en `web`, Docker Compose (`app`, `db`, `scheduler`), PostgreSQL, healthcheck.

2. **BFF BDNS:** busqueda y detalle normalizado, CCAA vía catalogo de regiones.

3. **UI:** listado con filtros, detalle en modal, gestion de **perfiles de alerta** en modal ("Gestionar alertas").

4. **Destinatarios de resumenes (email + Telegram):**
   - Tabla `notification_recipients` (canal `email` | `telegram`, `address`, `label`, `enabled`).
   - API: `GET/POST /api/settings/notification-recipients`, `PUT/DELETE .../[id]`.
   - Modal de alertas: seccion "Destinatarios del resumen" para varios correos y varios chat ID.
   - **Regla de envio:** si hay al menos una fila **activa** en BD para ese canal, se usa solo la BD; si no hay ninguna, **fallback** a `ALERT_RECIPIENTS` / `TELEGRAM_CHAT_ID` en `.env`.
   - Credenciales **SMTP** y **token del bot** siguen en entorno (no en la tabla).

5. **Job de alertas:** `runWeeklyAlerts`, deduplicacion `grants_snapshot`, historial `alerts_history`, envio paralelo email + Telegram con timeout por canal, rate limit y lock en endpoint manual.

6. **Copia del digest:** cadencia etiquetada con `ALERTS_DIGEST_PERIOD` (p. ej. diario); cuidado con caché `.next` en Docker al cambiar codigo (recrear contenedor si hiciera falta).

## Plan / bloques

Ver `.cursor/plans/plan_interno_ayudas_docker_bebc1756.plan.md` (incluye todo `bloque-4-destinatarios-multi`).

## Pendiente / siguiente foco

- Bloque 6 hardening (reintentos por canal, etc.).
- Bloque 7 separacion comercializable (sin multi-tenant aun).

## Regla de trabajo acordada con el usuario

Para cambios de codigo deseados como **instrucciones**: formato "como esta / que sustituir / donde".  
El usuario ejecuta los commits salvo que pida lo contrario.
