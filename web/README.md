# API Ayudas (web)

Aplicacion interna construida con Next.js + TypeScript para:

- buscar convocatorias en BDNS,
- guardar perfiles de alerta en PostgreSQL,
- ejecutar un **job de alertas** según cron (p. ej. diario),
- enviar avisos duplicados por **email** y **Telegram**.

## Objetivo funcional

El sistema permite definir varios perfiles de alerta (cada uno con sus filtros).  
En cada corrida programada (`ALERTS_AUTORUN_CRON`) se hace lo siguiente:

1. Se consulta BDNS por cada perfil activo.
2. Se comparan resultados contra snapshot historico (`grants_snapshot`) para detectar solo novedades.
3. Se registra trazabilidad en `alerts_history`.
4. Se envia resumen por email y por Telegram.
5. Se actualiza estado final de envio (`sent_both`, `sent_partial`, `error_both`, `no_news`).

## Arquitectura resumida

- **UI (Next.js App Router):**
  - Busqueda y filtros.
  - Gestion de perfiles de alertas (modal CRUD).
  - Gestion de **destinatarios** del resumen: varios emails y varios chat ID de Telegram.
- **BFF / API interna (Next.js route handlers):**
  - Encapsula llamadas a BDNS.
  - Gestiona el job de alertas y endpoints de estado/ejecucion.
- **Persistencia (PostgreSQL):**
  - `alert_profiles`: configuracion de perfiles.
  - `notification_recipients`: destinatarios por canal (email / telegram); multiples filas por canal.
  - `grants_snapshot`: deduplicacion por perfil.
  - `alerts_history`: auditoria de ejecuciones.
- **Servicios externos:**
  - BDNS (fuente de convocatorias).
  - SMTP (envio email).
  - Telegram Bot API (envio Telegram).

## Flujo del job de alertas

Archivo principal: `src/lib/alerts/weekly-runner.ts`

- Aplica un candado en memoria (`weeklyRunInProgress`) para bloquear ejecuciones concurrentes.
- Carga perfiles activos y ejecuta busqueda BDNS por perfil.
- Detecta novedades comparando ids contra `grants_snapshot`.
- Inserta una fila por perfil en `alerts_history` con estado inicial:
  - `pending_dispatch` si hay novedades,
  - `no_news` si no hay novedades.
- Si hay novedades, dispara en paralelo:
  - `sendWeeklyDigestEmail` (`src/lib/alerts/mailer.ts`)
  - `sendWeeklyDigestTelegram` (`src/lib/alerts/telegram.ts`)
- Cada canal se protege con timeout (`ALERTS_CHANNEL_TIMEOUT_MS`) para que no bloquee el job completo.
- Consolida resultado final y actualiza `alerts_history` pendiente.
- Escribe logs estructurados JSON para observabilidad.

## Destinatarios (email y Telegram)

- **UI:** modal "Gestionar alertas" → seccion *Destinatarios del resumen*.
- **API:**
  - `GET /api/settings/notification-recipients` — listar.
  - `POST /api/settings/notification-recipients` — crear (`channel`, `address`, `label` opcional, `enabled`).
  - `PUT /api/settings/notification-recipients/[id]` — actualizar (`enabled`, `label`, `address`, `channel`).
  - `DELETE /api/settings/notification-recipients/[id]` — borrar.

**Prioridad:** para cada canal, si en BD hay al menos un destinatario con `enabled = true`, el job usa **solo** esas direcciones. Si la lista activa en BD esta vacia, se usa el **fallback** del `.env` (`ALERT_RECIPIENTS` como lista separada por comas, `TELEGRAM_CHAT_ID` para un unico chat).

Los secretos del bot (`TELEGRAM_BOT_TOKEN`) y del SMTP no se guardan en esta tabla.

## Endpoint manual del job

Archivo: `src/app/api/alerts/weekly/run/route.ts`

- `POST /api/alerts/weekly/run`:
  - valida secreto opcional por header `x-alerts-secret`,
  - aplica rate limit en memoria (10s entre llamadas),
  - ejecuta `runWeeklyAlerts`.
- `GET /api/alerts/weekly/run`:
  - devuelve estado del runner (`inProgress`).

## Variables de entorno importantes

Definidas en `web/.env.local` (no versionado):

- **Base app/db**
  - `DATABASE_URL`
  - `APP_INTERNAL_URL`
  - `TZ`
- **BDNS**
  - `BDNS_BASE_URL`
  - `BDNS_TIMEOUT_MS`
  - `BDNS_RETRIES`
- **Job y seguridad**
  - `ALERTS_RUN_SECRET`
  - `ALERTS_AUTORUN_CRON`
  - `ALERTS_DIGEST_PERIOD` (etiqueta en email/Telegram/asunto; por defecto `diario`, p. ej. `semanal` si cambias el cron)
  - `ALERTS_CHANNEL_TIMEOUT_MS`
- **Email (SMTP)**
  - `ALERT_RECIPIENTS` (fallback si no hay emails activos en `notification_recipients`)
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`
- **Telegram**
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID` (fallback si no hay filas `telegram` activas en BD)

## Ejecucion en local con Docker

Desde la raiz del repo:

```bash
docker compose up -d --build
```

Servicios esperados:

- `db`: PostgreSQL
- `app`: Next.js
- `scheduler`: ejecuta cron y dispara el endpoint del job

## Ejecucion manual del job

Ejemplo PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/alerts/weekly/run" `
  -Headers @{ "x-alerts-secret" = "TU_SECRETO" }
```

## Logs y diagnostico

Eventos relevantes en logs:

- `weekly_run_http_requested`
- `weekly_run_http_rate_limited`
- `weekly_run_http_conflict`
- `weekly_run_started`
- `weekly_run_finished`
- `weekly_run_error`

Problemas tipicos:

- `401`: secreto incorrecto o ausente.
- `409`: ya hay una corrida en curso.
- `429`: llamadas manuales demasiado seguidas.
- `emailStatus=error`: revisar SMTP y `ALERT_RECIPIENTS`.
- `telegramStatus=error`: revisar token/chat id del bot.

## Notas de diseno

- El frontend no habla directo con BDNS: pasa por BFF para reducir acoplamiento.
- La configuracion sensible vive en variables de entorno.
- El diseno de capas deja base para evolucion futura (mas canales, multi-tenant, etc.).
