# Contexto de sesion - api-ayudas

Fecha: 2026-03-23
Proyecto: app interna para busqueda de ayudas BDNS, sin usuarios.

## Estado actual (hecho)

1. Bloque 1 completado
- Next.js + TypeScript en `web`.
- Docker Compose con `app` y `db` (PostgreSQL).
- Endpoint salud DB: `web/src/app/api/health/route.ts`.
- Ajuste de imagenes por incidencia de red con Docker Hub (uso de ECR Public para postgres).

2. Bloque 2 completado (BFF basico BDNS)
- Endpoint busqueda interno: `web/src/app/api/grants/search/route.ts`.
- Cliente BDNS y normalizacion: `web/src/lib/bdns/client.ts`.
- Mapeo principal: `descripcion`, `fechaRecepcion`, `nivel2`, `numeroConvocatoria`.

3. Bloque 3 en progreso (UI)
- Listado funcional con filtros y paginacion: `web/src/app/page.tsx`.
- Estilos base: `web/src/app/page.module.css`.
- Detalle interno:
  - API detalle: `web/src/app/api/grants/[id]/route.ts`.
  - Pagina detalle: `web/src/app/grants/[id]/page.tsx`.
  - CSS detalle: `web/src/app/grants/[id]/page.module.css`.

## Problemas resueltos

- Submodulo accidental en `web` corregido (ahora carpeta normal en git).
- Error `fetch failed` por endpoint placeholder BDNS corregido.
- Error de detalle 404 corregido ajustando URL de BDNS y `numConv`.
- Conflicto route/page en `/api/grants/[id]` corregido moviendo pagina fuera de `api`.
- Error `showPicker` corregido eliminando llamadas forzadas.

## Pendiente inmediato

1. Filtro por Comunidad Autonoma cuando `tipoAdministracion = A`
- Crear/usar catalogo de regiones y mostrar selector CCAA.
- Enviar `regionId` al backend y mapear a `regiones` en BDNS.

2. Revisar `web/src/app/page.tsx`
- Evitar estados/hooks fuera de `Home()`.
- Dejar consistentes estados `input` vs estados aplicados.

## Regla de trabajo acordada con el usuario (importante)

Cuando haya que cambiar codigo:

1. Mostrar primero **"Como esta ahora"** (fragmento actual).
2. Mostrar despues **"Que sustituir"** (fragmento nuevo).
3. Indicar **donde** cambiarlo (archivo y bloque).
4. Evitar explicaciones ambiguas del tipo "anade esto por ahi".

Formato preferido del usuario:
- "Lo que esta mal"
- "Lo que hay que cambiar"
- Con bloques antes/despues para comparar facilmente.

