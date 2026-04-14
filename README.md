# api-ayudas

Proyecto interno **Buscador de Ayudas**: aplicación web que consulta automáticamente las convocatorias públicas de ayudas y subvenciones del Estado español, permite filtrarlas, y envía alertas periódicas con las novedades relevantes para una empresa.

## ¿Qué hace?

- **Busca y filtra** convocatorias de ayudas y subvenciones publicadas en la Base de Datos Nacional de Subvenciones (BDNS).
- **Guarda perfiles de alerta** con filtros personalizados (texto libre, comunidad autónoma, administración, fechas) para vigilar convocatorias de interés.
- **Detecta novedades** comparando cada ejecución con un snapshot histórico, evitando repetir convocatorias ya notificadas.
- **Envía resúmenes** por **email** y **Telegram** a múltiples destinatarios configurados en base de datos.
- **Analiza con IA** (OpenAI) la relevancia de cada convocatoria nueva respecto al perfil de la empresa, clasificándolas como alta, media o baja e incluyendo el motivo en el digest.
- **Enriquece la información** consultando datos de elegibilidad de la API BDNS (tipo de beneficiario, sector, región, finalidad) para mejorar la precisión del análisis IA.

## Fuente de datos: API BDNS

Toda la información de convocatorias proviene de la **Base de Datos Nacional de Subvenciones (BDNS)**, gestionada por el Ministerio de Hacienda del Gobierno de España.

| Recurso | URL |
|---------|-----|
| Portal público BDNS | [https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatorias](https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatorias) |
| Documentación de la API | [https://www.pap.hacienda.gob.es/bdnstrans/GE/es/doc](https://www.pap.hacienda.gob.es/bdnstrans/GE/es/doc) |

La aplicación consume dos tipos de endpoints de esta API:

- **Búsqueda** (`/convocatorias`): listado paginado con filtros (texto, administración, comunidad autónoma, fechas, etc.).
- **Detalle** (`/convocatorias?numConv=X`): información completa de una convocatoria concreta, incluyendo tipos de beneficiarios, sectores económicos, regiones de impacto e instrumentos de ayuda.

Estas llamadas se encapsulan en una capa BFF (Backend For Frontend) dentro de la aplicación, de modo que el frontend no se acopla directamente a los detalles de la API pública.

## Navegación del repositorio

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

## Roadmap

| Fase | Contenido | Estado |
|------|-----------|--------|
| **Parte 1** (Bloques 1-7) | Buscador, alertas multi-perfil, email+Telegram, hardening, capas de código | Completada |
| **Parte 2** (Bloques 8-12) | Análisis IA de convocatorias con OpenAI: perfil de empresa, scoring de relevancia, digest enriquecido, enriquecimiento de elegibilidad vía API BDNS | Completada |

Detalles de cada bloque en el [plan interno](.cursor/plans/plan_interno_ayudas_docker_bebc1756.plan.md) y en la sección "Roadmap — Parte 2" de [`web/README.md`](web/README.md).
