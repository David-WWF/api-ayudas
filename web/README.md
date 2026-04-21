# API Ayudas (web) — Buscador de Ayudas

Aplicación interna (título en navegador: **Buscador de Ayudas**) construida con Next.js + TypeScript para:

- buscar convocatorias en BDNS,
- guardar perfiles de alerta en PostgreSQL,
- ejecutar un **job de alertas** según cron (p. ej. diario),
- enviar avisos duplicados por **email** y **Telegram**.

Documentación de referencia del portal y la API BDNS (Hacienda): [https://www.pap.hacienda.gob.es/bdnstrans/GE/es/doc](https://www.pap.hacienda.gob.es/bdnstrans/GE/es/doc).

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
  - Metadatos raíz: `src/app/layout.tsx` (`title`, `description`, `lang="es"`).
  - Busqueda y filtros.
  - Gestion de perfiles de alertas (modal CRUD).
  - Gestion de **destinatarios** del resumen: varios emails y varios chat ID de Telegram.
- **BFF / API interna (Next.js route handlers):**
  - Encapsula llamadas a BDNS.
  - Gestiona el job de alertas y endpoints de estado/ejecucion.
- **Persistencia (PostgreSQL):**
  - `alert_profiles`: configuracion de perfiles (incluye `schedule_cron` en BD; ver nota más abajo).
  - `notification_recipients`: destinatarios por canal (email / telegram); multiples filas por canal.
  - `grants_snapshot`: deduplicacion por perfil.
  - `alerts_history`: auditoria de ejecuciones.
  - `global_filters`: una fila (`id = 1`) con los filtros de búsqueda por defecto de la pantalla principal (texto, administración, fechas, orden).
  - `company_profile`: una fila (`id = 1`) con `context_text` (descripción de la empresa para el futuro análisis IA).
- **Servicios externos:**
  - BDNS (fuente de convocatorias).
  - SMTP (envio email).
  - Telegram Bot API (envio Telegram).

## Estructura del codigo (`web/`)

| Ruta | Rol |
|------|-----|
| `src/app/page.tsx` | Pagina principal: buscador, filtros, modal de detalle y gestion de alertas. |
| `src/app/grants/[id]/` | Pagina de detalle por convocatoria (ruta dedicada). |
| `src/app/settings/alerts/` | Pantalla de gestion de perfiles de alerta (alternativa al modal). |
| `src/app/api/**/route.ts` | Handlers REST (BFF, ajustes, salud, job). |
| `src/lib/domain/*` | Tipos y reglas puras (convocatorias, filtros de alerta); sin `fetch` ni Next. |
| `src/lib/bdns/urls.ts` | Base API BDNS y URLs públicas de convocatorias. |
| `src/lib/bdns/client.ts` | Busqueda BDNS, normalizacion de resultados. |
| `src/lib/bdns/detail.ts` / `regions.ts` | Detalle de convocatoria y catalogo CCAA (HTTP BDNS). |
| `src/lib/bdns/search-cache.ts` | Cache opcional en memoria por URL de busqueda. |
| `src/lib/alerts/weekly-runner.ts` | Job: perfiles, BDNS, snapshot, historial, disparo de canales. |
| `src/lib/alerts/mailer.ts` / `telegram.ts` | Envio email y Telegram. |
| `src/lib/alerts/notification-recipients.ts` | Tabla y CRUD de destinatarios. |
| `src/lib/alerts/channel-retry.ts` | Reintentos y timeout acumulado del job. |
| `src/lib/alerts/cron-match.ts` | Comprueba si `schedule_cron` del perfil cae en el minuto actual (`TZ`). |
| `src/lib/db.ts` | Cliente PostgreSQL (`DATABASE_URL`). |

## Cron global (`scheduler`) y cron por perfil (`schedule_cron`)

Hay **dos** mecanismos que conviven:

1. **`ALERTS_AUTORUN_CRON`** (contenedor `scheduler`): con qué frecuencia se llama a `POST /api/alerts/weekly/run`. Es el “despertador” del job.

2. **`schedule_cron` en cada perfil** (guardado en BD / UI): en qué **minuto** (día/hora según expresión tipo crontab) ese perfil debe evaluarse **si** activas el filtro siguiente.

### Modo simple (por defecto)

- **`ALERTS_RESPECT_PROFILE_CRON`** sin definir, `false`, o distinto de `1` / `true` / `yes`.
- En cada ejecución del job se procesan **todos** los perfiles activos; el campo `schedule_cron` se ignora para la lógica (sigue guardándose en BD para la UI).

### Modo por perfil

- Pon **`ALERTS_RESPECT_PROFILE_CRON=true`** en `web/.env.local`.
- El runner solo consulta BDNS y escribe historial para los perfiles cuyo `schedule_cron` **coincide con el minuto actual** según **`TZ`** (misma zona que usa el `scheduler`).
- Para que los perfiles con horarios distintos puedan dispararse, el **scheduler** debe llamar al endpoint **a menudo** (típicamente **cada minuto**):  
  `ALERTS_AUTORUN_CRON=* * * * *`  
  (en Alpine cron: cinco campos, minuto hora día mes día-semana).
- Expresiones en formato habitual de 5 campos (como en la UI por defecto `0 9 * * 1`). Si la expresión es inválida, ese perfil no coincidirá y se omitirá en esa corrida.

La respuesta JSON del job incluye **`profilesSkippedCron`**: cuántos perfiles se saltaron en esa ejecución por no tocar su minuto. Logs: `weekly_run_profile_skipped_cron`, `weekly_run_started` incluye `respectProfileCron` y `timeZone`.

## Flujo del job de alertas

Archivo principal: `src/lib/alerts/weekly-runner.ts`

- Aplica un candado en memoria (`weeklyRunInProgress`) para bloquear ejecuciones concurrentes.
- Carga perfiles activos; opcionalmente filtra por `schedule_cron` (ver arriba).
- Ejecuta busqueda BDNS por perfil seleccionado.
- Detecta novedades comparando ids contra `grants_snapshot`.
- Inserta una fila por perfil en `alerts_history` con estado inicial:
  - `pending_dispatch` si hay novedades,
  - `no_news` si no hay novedades.
- Si hay novedades: envía el digest por `sendWeeklyDigestEmail` (`mailer.ts`) y después el informe corto por `sendAlertStatusTelegram` (`telegram.ts`).
- Si no hay novedades (o solo omitidos por cron / sin perfiles): envía solo el informe de estado por Telegram cuando hay chats configurados.
- Cada canal se protege con timeout exterior (`ALERTS_CHANNEL_TIMEOUT_MS`) para que no bloquee el job completo; si hay reintentos, el presupuesto se amplía automáticamente (ver abajo).
- Reintentos por canal (SMTP y cada mensaje de Telegram): `ALERTS_CHANNEL_RETRIES` (por defecto `2`, es decir hasta 3 intentos) y `ALERTS_CHANNEL_RETRY_DELAY_MS` (base del backoff exponencial entre intentos, por defecto `1000`).
- Consolida resultado final y actualiza `alerts_history` pendiente.
- Escribe logs estructurados JSON para observabilidad.

Un **diagrama de secuencia** (Mermaid) del mismo flujo, para onboarding o revisiones con el equipo, está en [`docs/alert-job-sequence.md`](../docs/alert-job-sequence.md) (raíz del monorepo, no dentro de `web/`).

**Evolución comercial / multi-tenant (bloque 7):** lineamientos sin implementar usuarios aún en [`docs/evolucion-multi-tenant.md`](../docs/evolucion-multi-tenant.md).

## Tests

En la carpeta `web/`:

```bash
npm run test
```

Comprueba que existen los `route.ts` de cada ruta API listada en **Referencia de la API interna** (`src/test/documented-api-routes.test.ts`), reglas de filtros (`alert-filters.test.ts`) y cron por perfil (`cron-match.test.ts`).

Para modo interactivo: `npm run test:watch`.

## Destinatarios (email y Telegram)

- **UI:** modal "Gestionar alertas" → seccion *Destinatarios del resumen*.
- **API:**
  - `GET /api/settings/notification-recipients` — listar.
  - `POST /api/settings/notification-recipients` — crear (`channel`, `address`, `label` opcional, `enabled`).
  - `PUT /api/settings/notification-recipients/[id]` — actualizar (`enabled`, `label`, `address`, `channel`).
  - `DELETE /api/settings/notification-recipients/[id]` — borrar.

**Prioridad:** para cada canal, si en BD hay al menos un destinatario con `enabled = true`, el job usa **solo** esas direcciones. Si la lista activa en BD esta vacia, se usa el **fallback** del `.env` (`ALERT_RECIPIENTS` como lista separada por comas, `TELEGRAM_CHAT_ID` para un unico chat).

Los secretos del bot (`TELEGRAM_BOT_TOKEN`) y del SMTP no se guardan en esta tabla.

## Referencia de la API interna

Todas las rutas bajo `/api` son la **BFF** (el navegador no llama a BDNS directamente salvo recursos estaticos). Respuestas habituales: JSON con `ok: true` / `ok: false` y `data` o `error` segun el endpoint.

### Convocatorias (BDNS)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/grants/search` | Busqueda paginada. Query: `q`, `page`, `pageSize`, `fechaDesde`, `fechaHasta`, `tipoAdministracion` (`C` / `A` / `L` / `O`), `order`, `direccion` (`asc` / `desc`), `regionId` (si tipo `A`). |
| `GET` | `/api/grants/[id]` | Detalle por numero de convocatoria (`numConv` en BDNS). |

### Catalogos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/catalogs/regions` | Lista de CCAA derivada del arbol de regiones BDNS (`BDNS_BASE_URL`). |

### Ajustes (PostgreSQL)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/settings/global-filters` | Lee filtros globales de la UI (fila unica). |
| `PUT` | `/api/settings/global-filters` | Actualiza cuerpo JSON: `searchText`, `tipoAdministracion`, `regionId`, fechas, `orderBy`, `direccion`. |
| `GET` | `/api/settings/alert-profiles` | Lista perfiles de alerta. |
| `POST` | `/api/settings/alert-profiles` | Crea perfil (`name`, `enabled`, `filters`, `scheduleCron` opcional). |
| `GET` | `/api/settings/alert-profiles/[id]` | Un perfil. |
| `PUT` | `/api/settings/alert-profiles/[id]` | Actualiza perfil completo. |
| `DELETE` | `/api/settings/alert-profiles/[id]` | Elimina perfil. |
| `GET` | `/api/settings/notification-recipients` | Lista destinatarios. |
| `POST` | `/api/settings/notification-recipients` | Crea (`channel`, `address`, `label`, `enabled`). |
| `PUT` | `/api/settings/notification-recipients/[id]` | Parche de campos. |
| `DELETE` | `/api/settings/notification-recipients/[id]` | Elimina. |
| `GET` | `/api/settings/company-profile` | Lee el perfil de empresa (contexto IA, fila unica). |
| `PUT` | `/api/settings/company-profile` | Actualiza `contextText` (texto libre). |

### Análisis IA

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `POST` | `/api/ai/analyze-test` | Prueba aislada: analiza convocatorias con el perfil de empresa guardado. Body opcional `{ grants: [...] }`; sin body usa las ultimas 5 del snapshot. Requiere `OPENAI_API_KEY`. |

### Salud y job

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/api/health` | Comprueba `DATABASE_URL` y conexion `SELECT NOW()`. |
| `GET` | `/api/alerts/weekly/run` | Estado del runner (`inProgress`). |
| `POST` | `/api/alerts/weekly/run` | Ejecuta el job; header opcional `x-alerts-secret` si `ALERTS_RUN_SECRET` esta definido. |
| `POST` | `/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>` | Updates del bot (comandos `/status`, `/last_run`, `/test_mail`, `/count_users`). El segmento final debe coincidir con la variable de entorno. |
| `GET` | `/api/ops/status-helper` | Datos para el modal **Status helper**: ultima ejecucion del job (`alert_job_ops_state`), listado de destinatarios (etiqueta, canal, direccion, estado), totales por canal y `requiresWeeklyRunSecret` (true si `ALERTS_RUN_SECRET` esta definido). |
| `POST` | `/api/ops/status-helper/test-mail` | Correo de prueba SMTP con **vista previa HTML** del digest (datos sinteticos) ademas de texto plano (`TEST_MAIL_TO` o valor por defecto documentado). |
| `POST` | `/api/ops/status-helper/run-job` | Ejecuta el mismo job que `POST /api/alerts/weekly/run` (misma auth `x-alerts-secret` si hay secreto, mismo rate limit **10 s** en memoria compartida). Respuesta JSON acotada (`runId`, `dispatchStatus`, totales, estados de canales). |

**Seguridad:** no hay login de usuarios; quien pueda llegar al puerto 3000 puede usar la API. El unico control opcional del job es el secreto del `POST` anterior. En un PC dedicado en red local, restringe acceso de red o firewall si hace falta.

## Detalle del handler del job

Implementacion: `src/app/api/alerts/weekly/run/route.ts` y `src/app/api/ops/status-helper/run-job/route.ts`. El rate limit **10 s** entre POST manuales es **compartido** (modulo `src/lib/alerts/weekly-run-manual-rate-limit.ts`). La auth por cabecera `x-alerts-secret` esta centralizada en `src/lib/alerts/alerts-run-http-auth.ts`. Respuestas HTTP tipicas: **401** (secreto incorrecto si `ALERTS_RUN_SECRET` esta definido), **429** (rate limit), **409** (`WeeklyRunAlreadyRunningError`), **500** (error interno).

Webhook del bot: `src/app/api/telegram/webhook/[secret]/route.ts`. Registrar con la API de Telegram `setWebhook` apuntando a tu dominio publico HTTPS. Solo responde a chats autorizados (destinatarios `telegram` activos en BD o `TELEGRAM_OPS_CHAT_IDS`).

## Variables de entorno importantes

Definidas en `web/.env.local` (no versionado). Hay una **plantilla** comentada en `web/.env.example` para copiar y rellenar.

- **Base app/db**
  - `DATABASE_URL` — cadena PostgreSQL. En Docker Compose tipica: `postgresql://postgres:postgres@db:5432/ayudas` (usuario/clave/db deben coincidir con el servicio `db` del compose).
  - `APP_INTERNAL_URL` — URL base que usa el contenedor **`scheduler`** para el `curl` del cron (debe resolver dentro de la red Docker). Valor habitual: `http://app:3000` (nombre del servicio `app` + puerto interno del contenedor).
  - `TZ` — huso horario del cron en Alpine (`scheduler`); alinear con la hora en que quieres que corra `ALERTS_AUTORUN_CRON`.
- **BDNS**
  - `BDNS_SEARCH_ENDPOINT` — URL completa del endpoint de búsqueda (obligatorio para listados; documentacion oficial BDNS / PAP; plantilla en `web/.env.example`).
  - `BDNS_BASE_URL` — base de la API usada en detalle y catalogo de regiones (tiene valor por defecto en código si no se define).
  - `BDNS_TIMEOUT_MS`, `BDNS_RETRIES`
  - `BDNS_SEARCH_CACHE_TTL_SECONDS` — opcional; si es `> 0`, cache en memoria de resultados de búsqueda por URL (misma consulta dentro del TTL evita llamar a BDNS; útil con muchas peticiones repetidas; máximo 3600 s).
- **Job y seguridad**
  - `ALERTS_RUN_SECRET` — si esta **vacío o ausente**, el `POST /api/alerts/weekly/run` **no exige** cabecera (comodo en local; en red amplia conviene definirlo). Si tiene valor, el cliente debe enviar `x-alerts-secret` identico.
  - `ALERTS_AUTORUN_CRON` — linea de cron (usuario root en el contenedor Alpine) que dispara el `POST`; debe incluir URL y cabecera como en `docker-compose.yml`. Con `ALERTS_RESPECT_PROFILE_CRON=true` suele usarse `* * * * *` para evaluar cada minuto.
  - `ALERTS_RESPECT_PROFILE_CRON` — si es `true` / `1` / `yes`, solo se procesan perfiles cuyo `schedule_cron` coincide con el minuto actual (`TZ`). Por defecto (sin variable) es **desactivado** para no cambiar el comportamiento previo.
  - `ALERTS_DIGEST_PERIOD` (etiqueta en email/Telegram/asunto; por defecto `diario`, p. ej. `semanal` si cambias el cron)
  - `ALERTS_CHANNEL_TIMEOUT_MS` (presupuesto por intento de envío; el timeout total del canal en el runner crece con reintentos)
  - `ALERTS_CHANNEL_RETRIES` (reintentos tras un fallo; `0` = un solo intento, como antes)
  - `ALERTS_CHANNEL_RETRY_DELAY_MS` (milisegundos base entre intentos fallidos; backoff exponencial)
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
  - `TELEGRAM_WEBHOOK_SECRET` (segmento de URL del webhook; sin definir, el POST del webhook responde 404)
  - `TELEGRAM_OPS_CHAT_IDS` (opcional; CSV de chat_id con permiso para comandos ademas de destinatarios activos)
  - `TEST_MAIL_TO` (opcional; destino de `/test_mail`, por defecto `david@weworkfactory.com` en codigo si no se define)
- **IA (análisis de convocatorias)**
  - `OPENAI_API_KEY` (secreto; sin ella el sistema funciona sin sección IA)
  - `AI_MODEL` (por defecto `gpt-4o-mini`)
  - `AI_MAX_GRANTS_PER_CALL` (máximo de convocatorias por llamada, por defecto `30`)

**Compose (`docker-compose.yml`):** además fija `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, `WATCHPACK_POLLING` en el servicio `app` (desarrollo con volúmenes montados); no suelen duplicarse en `.env.local` salvo que quieras sobreescribir.

## Ejecucion en local con Docker

### Desarrollo (por defecto)

`docker-compose.yml`: codigo montado en volumen, **`npm run dev`** dentro del contenedor. Ideal para editar y ver cambios al instante.

Desde la raiz del repo:

```bash
docker compose up -d --build
```

Servicios esperados:

- `db`: PostgreSQL
- `app`: Next.js (modo desarrollo)
- `scheduler`: ejecuta cron y dispara el endpoint del job

### Producción en el mismo PC

`docker-compose.prod.yml`: construye la app con **`Dockerfile.prod`** (salida **standalone** de Next, sin montar `./web`). Menos sobrecarga y sin hot-reload; tras cambiar codigo hay que **reconstruir** la imagen del servicio `app`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Requisitos: mismo `web/.env.local` que en desarrollo; `next.config.ts` define `output: "standalone"` para generar `.next/standalone` en el build.

## PC dedicado como servidor (este equipo)

En este despliegue **no hay servidor externo**: un PC fijo actúa como host de Docker, la interfaz web y las alertas programadas. Implica que **todo depende de que ese equipo esté encendido** (o despierto) cuando toque el cron.

### Checklist operativo

1. **Docker al inicio de sesión**  
   En Windows, configura **Docker Desktop** (o el motor que uses) para que arranque con el sistema. Si Docker no está en marcha, `docker compose` no levantará los contenedores.

2. **Levantar el stack tras un reinicio**  
   Desde la **raíz del repositorio** (carpeta que contiene `docker-compose.yml` y `web/`):

   ```bash
   docker compose up -d --build
   ```

   Comprueba contenedores: `docker compose ps` (deberían figurar `ayudas_app`, `ayudas_db`, `ayudas_scheduler`).  
   Para no repetir el comando tras cada arranque del PC, usa la subsección **Arranque automático del stack** más abajo.

3. **Zona horaria del cron**  
   El servicio `scheduler` usa la variable `TZ` del `env_file` (`web/.env.local`) para alinear `ALERTS_AUTORUN_CRON` con tu hora local. Si las alertas “cambian de hora”, revisa `TZ` y el huso del PC.

4. **Copias de seguridad de PostgreSQL**  
   Los datos viven en el volumen Docker `postgres_data` (no en el código). Haz copias periódicas; ejemplo con `pg_dump` desde el contenedor de la base de datos:

   ```powershell
   docker exec ayudas_db pg_dump -U postgres ayudas > backup_ayudas.sql
   ```

   Guarda ese archivo **fuera** del disco donde solo confías en un único equipo (disco externo, otro PC o nube que ya uséis).

5. **Archivo `web/.env.local`**  
   No está en Git. Contiene secretos (SMTP, bot Telegram, `ALERTS_RUN_SECRET`, URLs BDNS, `DATABASE_URL`, etc.). Mantén una **copia privada** aparte del repo por si se pierde el disco o se reinstala Windows.

6. **Acceso a la interfaz**  
   Por defecto la app publica el puerto **3000** en el host (`localhost:3000`). Para abrirlo a otros equipos de la **misma red local** habría que permitir el puerto en el firewall de Windows; solo tiene sentido en redes de confianza.

7. **Suspensión / hibernación**  
   Si el PC entra en suspensión profunda, los contenedores dejan de ejecutarse y **el cron no dispara** hasta que vuelva Docker y los servicios estén arriba. Para alertas fiables, evita suspender ese equipo en la franja crítica o programa el sistema para no suspenderse.

### Arranque automático del stack (Windows)

**Objetivo:** tras encender el PC e iniciar sesión, que Docker Desktop arranque y, un poco después, se ejecute `docker compose up -d` **sin** tener que abrir una terminal a mano cada vez.

**Por qué un retraso:** Docker Desktop tarda unos segundos (a veces más de un minuto) en dejar listo el demonio. Si lanzas `compose` demasiado pronto, el comando falla.

1. Activa en Docker Desktop **Settings → General → Start Docker Desktop when you sign in to your computer** (o el equivalente en tu idioma).

2. En el repo hay un script que espera a que `docker` responda y luego levanta los servicios:

   - Ruta: `scripts/levantar-api-ayudas-docker.ps1` (relativa a la raíz del proyecto, junto a `docker-compose.yml`).

3. Crea una **tarea programada** (Programador de tareas de Windows):

   - **Desencadenador:** al iniciar sesión (tu usuario habitual).
   - **Retraso:** 1 o 2 minutos (según lo lento que arranque Docker en tu máquina); si aún falla, sube el retraso o aumenta la espera máxima dentro del script (`$maxSeconds`).
   - **Acción:** iniciar un programa:
     - Programa: `powershell.exe`
     - Argumentos (ajusta la ruta al clon real del repo):

       ```text
       -NoProfile -ExecutionPolicy Bypass -File "D:\Proyectos_DavidJ\api-ayudas\scripts\levantar-api-ayudas-docker.ps1"
       ```

   - **Carpeta de inicio** (`Iniciar en`): déjala vacía o pon la raíz del repo; el script ya hace `cd` al directorio correcto.

4. **Primera prueba manual:** cierra sesión, vuelve a entrar, espera el retraso configurado y comprueba `docker compose ps` o abre `http://localhost:3000`.

**Nota:** el script usa `docker compose up -d` **sin** `--build` para arranques rápidos tras un reinicio. Cuando actualices código o dependencias, conviene ejecutar una vez a mano desde la raíz del repo:

```bash
docker compose up -d --build
```

### Nota sobre modo desarrollo vs producción

El `docker-compose.yml` usa **`npm run dev`**. Para servicio continuo en el PC dedicado, valorad **`docker-compose.prod.yml`** + `Dockerfile.prod` (Next compilado, `node server.js`).

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
- `weekly_run_http_failed` (error no esperado en el handler HTTP del POST, distinto del 409)
- `weekly_run_started` (incluye `respectProfileCron`, `timeZone`)
- `weekly_run_profile_skipped_cron`
- `weekly_run_finished`
- `weekly_run_error`

Problemas tipicos:

- `401`: secreto incorrecto o ausente.
- `409`: ya hay una corrida en curso.
- `429`: llamadas manuales demasiado seguidas.
- `emailStatus=error`: revisar SMTP, destinatarios activos en `notification_recipients` o fallback `ALERT_RECIPIENTS`.
- `telegramStatus=error`: revisar `TELEGRAM_BOT_TOKEN`, chats activos en BD o fallback `TELEGRAM_CHAT_ID`.
- Tras cambios en código del **servidor** o en metadatos, si algo parece «atascado»: `docker compose restart app` o `docker compose up -d --force-recreate app` (el volumen `.next` del contenedor puede conservar bundles viejos).

## Notas de diseno

- El frontend no habla directo con BDNS: pasa por BFF para reducir acoplamiento.
- La configuracion sensible vive en variables de entorno.
- El diseno de capas deja base para evolucion futura (mas canales, multi-tenant, etc.).

---

## Roadmap — Parte 2: Análisis IA de convocatorias

Próxima evolución del producto: en lugar de solo notificar convocatorias nuevas, **analizarlas automáticamente** con IA para indicar cuáles encajan con la empresa.

| Bloque | Descripción | Estado |
| ------ | ----------- | ------ |
| 8 | **Perfil de empresa** — tabla `company_profile` + API + UI para describir sector, tamaño, ubicación e intereses. | Completado |
| 9 | **Módulo grant-analyzer** — `lib/ai/grant-analyzer.ts`; llamada a OpenAI (`gpt-4o-mini`) con contexto de empresa + convocatorias; devuelve relevancia (alta/media/baja) + motivo. | Completado |
| 10 | **Integrar IA en el job** — en `weekly-runner.ts`, tras detectar novedades y antes del envío; degradación limpia si no hay API key o perfil. | Completado |
| 11 | **Digest enriquecido** — sección "Recomendación IA" al inicio de email (tabla HTML) y Telegram (lista compacta); ordenado por prioridad; disclaimer de sugerencia. | Completado |
| 12 | **Enriquecimiento de elegibilidad** — obtener tipo de beneficiario, sector, región y finalidad vía API BDNS (JSON, sin scraping); enriquecer prompt IA para descartar ayudas no elegibles. | Completado |

### Variables de entorno nuevas (Parte 2)

| Variable | Descripción | Por defecto |
| -------- | ----------- | ----------- |
| `OPENAI_API_KEY` | Clave de la API de OpenAI (secreto). | — |
| `AI_MODEL` | Modelo de OpenAI a usar. | `gpt-4o-mini` |
| `AI_MAX_GRANTS_PER_CALL` | Máximo de convocatorias a analizar por corrida. | `30` |
| `AI_ENRICH_DETAIL` | Activar enriquecimiento de convocatorias vía API BDNS antes del análisis IA. | `true` |

> **Principio clave:** si la IA falla o no está configurada, el sistema sigue funcionando exactamente igual que antes (solo se omite la sección de recomendación).
