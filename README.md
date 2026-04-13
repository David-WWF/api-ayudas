# api-ayudas

Proyecto interno **Buscador de Ayudas**: búsqueda de convocatorias (BDNS), perfiles de alerta en PostgreSQL y envío de resúmenes por **email** y **Telegram** según cron.

| Qué | Dónde |
|-----|--------|
| Diagrama de secuencia del job de alertas (Mermaid) | [`docs/alert-job-sequence.md`](docs/alert-job-sequence.md) |
| Evolución multi-tenant / comercialización (criterios) | [`docs/evolucion-multi-tenant.md`](docs/evolucion-multi-tenant.md) |
| Documentación de uso, variables, API y PC dedicado | [`web/README.md`](web/README.md) |
| Código Next.js (App Router, API, UI) | [`web/`](web/) |
| Tests (rutas API vs README) | `cd web && npm run test` |
| Orquestación Docker desarrollo (`npm run dev` + volúmenes) | [`docker-compose.yml`](docker-compose.yml) |
| Orquestación Docker producción (Next standalone, sin volúmenes de código) | [`docker-compose.prod.yml`](docker-compose.prod.yml) |
| Arranque automático en Windows | [`scripts/levantar-api-ayudas-docker.ps1`](scripts/levantar-api-ayudas-docker.ps1) |

## Arranque rápido

1. Copia la plantilla de entorno: `web/.env.example` → `web/.env.local` y rellena valores (sobre todo `DATABASE_URL`, BDNS, SMTP, Telegram y secretos del job).
2. Desde la **raíz del repositorio** (desarrollo con hot-reload):

   ```bash
   docker compose up -d --build
   ```

   Para **producción** en el PC (build Next standalone, sin montar código):

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

3. Interfaz: [http://localhost:3000](http://localhost:3000).

La documentación detallada (tablas de BD, endpoints, logs, backups) está en **`web/README.md`**.
