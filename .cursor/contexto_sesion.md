# Contexto de sesion - api-ayudas

Ultima actualizacion: 2026-04-13

Proyecto: app interna **Buscador de Ayudas** (titulo de pestaña y producto) para busqueda de convocatorias BDNS, sin cuentas de usuario.

## Estado actual (hecho)

1. **Base:** Next.js + TypeScript en `web`, Docker Compose desarrollo (`docker-compose.yml`) o producción (`docker-compose.prod.yml` + `Dockerfile.prod` standalone), PostgreSQL, healthcheck.

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

6. **Documentacion en repo:** `README.md` en la raiz; `web/README.md`; `docs/alert-job-sequence.md`; `docs/evolucion-multi-tenant.md` (bloque 7); `web/.env.example`; comentarios en `docker-compose.yml`; plan en `.cursor/plans/plan_interno_ayudas_docker_bebc1756.plan.md`.
7. **Tests:** en `web/`, `npm run test` (Vitest) — rutas API documentadas + `normalizeAlertFilters`.

## Plan / bloques

- Bloques **1–5** y **destinatarios multi** del plan: **completados**.
- **Bloque 6 (hardening):** **completado** — reintentos email/Telegram (`ALERTS_CHANNEL_RETRIES`, backoff), timeout exterior del job ajustado a reintentos; caché BDNS opcional (`BDNS_SEARCH_CACHE_TTL_SECONDS`).
- **Bloque 7:** completado — `web/src/lib/domain`, BDNS en `detail.ts`/`regions.ts`/`urls.ts`, guia `docs/evolucion-multi-tenant.md`.

### Parte 2 — Análisis IA de convocatorias (pendiente)

Objetivo: pasar de vigilancia ("hay N nuevas") a recomendación ("estas 3 encajan con vuestra empresa"). Flujo: opción A (análisis **antes** del envío, dentro del job).

- **Bloque 8 (perfil empresa):** **completado** — tabla `company_profile` (fila única, `context_text`), API `GET/PUT /api/settings/company-profile`, sección en modal "Gestión de alertas" con textarea.
- **Bloque 9 (grant-analyzer):** **completado** — `lib/ai/grant-analyzer.ts` (SDK `openai`, `analyzeGrants`, parser robusto), endpoint `POST /api/ai/analyze-test`, variables `OPENAI_API_KEY` / `AI_MODEL` / `AI_MAX_GRANTS_PER_CALL`.
- **Bloque 10 (IA en job):** **completado** — en `weekly-runner.ts` lee `company_profile`, llama a `analyzeGrants`, pasa `aiMap` a canales, persiste scoring en `alerts_history`; degradación limpia si falta clave/perfil/error IA.
- **Bloque 11 (digest enriquecido):** **completado** — sección "Recomendación IA" al inicio del email (tabla HTML ordenada por prioridad + links) y Telegram (lista con emoji, bajas solo contadas, disclaimer).
- **Bloque 12 (enriquecimiento elegibilidad):** **completado** — la API BDNS (`/convocatorias?numConv=X`) devuelve `tiposBeneficiarios`, `sectores`, `regiones`, `descripcionFinalidad` en JSON (sin scraping). `fetchGrantEligibility()` + `enrichGrantsWithEligibility()` en `detail.ts`; orquestación con concurrencia limitada (5) en `weekly-runner.ts` antes del análisis IA; prompt actualizado con criterios de elegibilidad; variable `AI_ENRICH_DETAIL`.

Variables de entorno nuevas: `OPENAI_API_KEY`, `AI_MODEL`, `AI_MAX_GRANTS_PER_CALL`, `AI_ENRICH_DETAIL`.

## UI — Dark mode (implementado en sesion 2026-04-14)

La interfaz usa **modo oscuro permanente** (no toggle). Paleta gris-azulada:

- Fondo pagina `#111318`, superficie principal `#1a1d27`, tarjetas `#1f2230`, inputs `#161821`.
- Texto primario `#e5e7eb`, secundario `#9ca3af`, muted `#6b7280`.
- Bordes `#2a2d38` (suave) / `#363a47` (medio).
- Links teal `#5eead4`, accent azul `#60a5fa`.
- Botones de accion: danger rojo oscuro, success verde oscuro, warning ambar oscuro, muted gris, primary azul oscuro; save company verde solido, add/search azul solido.
- Detalle completo en `.cursor/plans/dark_mode_ui_1f7b51a0.plan.md`.

Archivos CSS afectados: `web/src/app/globals.css`, `web/src/app/page.module.css`.

## Regla de trabajo acordada con el usuario

- Formato preferido para cambios guiados: **como esta / que sustituir / donde**.
- Los **commits** los ejecuta normalmente **el usuario**; puede pedir que los haga el asistente de forma explicita.
