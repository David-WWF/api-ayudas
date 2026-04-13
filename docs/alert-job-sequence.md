# Secuencia del job de alertas (resumen operativo)

Este diagrama describe el flujo lógico desde el **handler HTTP** hasta el núcleo del job: `web/src/app/api/alerts/weekly/run/route.ts` → **`runWeeklyAlerts`** en `web/src/lib/alerts/weekly-runner.ts`, alineado con `web/README.md`.

**Disparadores habituales:**

1. Contenedor **`scheduler`** (cron con `ALERTS_AUTORUN_CRON`) → `POST /api/alerts/weekly/run`.
2. Llamada manual (PowerShell, etc.) al mismo endpoint.

```mermaid
sequenceDiagram
  autonumber
  participant S as Scheduler o cliente HTTP
  participant API as POST /api/alerts/weekly/run
  participant R as runWeeklyAlerts
  participant DB as PostgreSQL
  participant B as BDNS (HTTP)
  participant E as SMTP (email)
  participant T as Telegram API

  S->>API: POST + opcional x-alerts-secret
  API->>API: Autorización / rate limit / candado
  API->>R: runWeeklyAlerts()

  R->>DB: ensureTables (perfiles, snapshot, historial…)
  R->>DB: SELECT perfiles enabled=true

  loop Por cada perfil activo (omitido si no toca su schedule_cron y ALERTS_RESPECT_PROFILE_CRON)
    R->>B: searchGrants (filtros del perfil)
    B-->>R: listado convocatorias
    R->>DB: SELECT grant_id conocidos (snapshot)
    R->>R: Calcular novedades
    R->>DB: UPSERT grants_snapshot
    R->>DB: INSERT alerts_history (pending_dispatch | no_news)
  end

  alt Hay novedades en algún perfil
    R->>R: Promise.all email + Telegram (timeout exterior)
    R->>E: sendWeeklyDigestEmail (reintentos internos)
    R->>T: sendWeeklyDigestTelegram (reintentos por mensaje)
    E-->>R: resultado canal
    T-->>R: resultado canal
    R->>DB: UPDATE alerts_history pending_dispatch → estado final
  else Sin novedades
    R->>R: dispatchStatus = no_news (sin envío)
  end

  R-->>API: WeeklyRunResult
  API-->>S: JSON { ok, data }
```

## Notas

- **Dos niveles de cron:** `ALERTS_AUTORUN_CRON` dispara el `POST`. Si `ALERTS_RESPECT_PROFILE_CRON=true`, dentro del job solo se procesan perfiles cuyo `schedule_cron` coincide con el minuto actual (`TZ`); ver `web/README.md`.
- **Caché BDNS:** si `BDNS_SEARCH_CACHE_TTL_SECONDS > 0`, las búsquedas repetidas con la misma URL pueden servirse desde memoria antes de llamar a BDNS.
- **Errores HTTP del POST:** 401 (secreto), 429 (rate limit), 409 (job ya en curso), 500 (error interno); logs `weekly_run_*` en consola del proceso Node.
