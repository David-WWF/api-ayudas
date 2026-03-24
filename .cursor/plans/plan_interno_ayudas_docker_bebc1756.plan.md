---
name: Plan interno ayudas docker
overview: Planificar un MVP interno con Next.js para búsqueda y alertas semanales de subvenciones, sin gestión de usuarios, usando Docker desde el inicio y con enfoque didáctico paso a paso.
todos:
  - id: bloque-1-docker-base
    content: Levantar estructura Next.js + PostgreSQL en Docker y verificar entorno reproducible.
    status: completed
  - id: bloque-2-bdns-bff
    content: Implementar integración BDNS detrás de endpoint interno normalizado.
    status: completed
  - id: bloque-3-front-busqueda
    content: Construir buscador, listado y detalle consumiendo la API interna.
    status: completed
  - id: bloque-4-config-alertas
    content: Crear configuración interna multi-alerta (perfiles) y destinatarios fijos.
    status: in_progress
  - id: bloque-5-alerta-semanal
    content: Implementar job semanal multi-perfil con deduplicación y envío de email resumen.
    status: pending
  - id: bloque-6-hardening
    content: Aplicar validaciones, logs y ajustes de rendimiento para uso interno.
    status: pending
isProject: false
---

# Plan revisado: app interna de ayudas (sin usuarios) + aprendizaje guiado

## Enfoque de trabajo entre los dos

- Lo construiremos en modo **pair programming guiado**: tú implementas y yo te doy instrucciones, explicación del porqué y código completo en cada paso.
- No editaré código por mi cuenta salvo que me lo pidas explícitamente.
- Cada bloque incluirá:
  - objetivo,
  - concepto técnico que estás aprendiendo,
  - pasos concretos,
  - código completo para copiar/transcribir,
  - checklist de verificación.

## Objetivo del producto (fase interna)

Aplicación web interna para:

- Buscar convocatorias de ayudas/subvenciones a empresas.
- Filtrar y consultar detalle.
- Enviar alertas **semanales** por email con resultados nuevos según múltiples perfiles de filtros.

Fuente principal: BDNS ([https://www.pap.hacienda.gob.es/bdnstrans/GE/es/doc](https://www.pap.hacienda.gob.es/bdnstrans/GE/es/doc)).

## Arquitectura recomendada (simplificada)

- **Frontend + Backend web**: Next.js con TypeScript.
- **Persistencia**: PostgreSQL.
- **Procesos de alertas**: job programado semanal.
- **Email**: proveedor transaccional (p. ej. Resend/SendGrid).
- **Contenerización**: Docker + Docker Compose desde el día 1.

```mermaid
flowchart LR
  internalUser[EquipoInterno] --> web[NextWeb]
  web --> api[NextAPI_BFF]
  api --> bdns[BDNS_API]
  api --> db[PostgreSQL_Docker]
  api --> weeklyJob[WeeklyAlertJob]
  weeklyJob --> mail[EmailProvider]
```



## Estructura funcional (sin cuentas)

- Búsqueda y listado con filtros.
- Detalle de convocatoria.
- Configuración interna de alertas con múltiples perfiles (destinatarios fijos compartidos).
- Motor de alertas semanal que:
  - ejecuta búsqueda por perfil,
  - detecta novedades por perfil,
  - envía un email resumen a lista fija.

## Diferenciación frente al portal BDNS (valor añadido)

Para no replicar únicamente la consulta pública, se añade enfoque operativo interno:

- **Perfiles de alerta persistentes**:
  - múltiples perfiles de filtros de negocio (texto, CCAA, administración, fechas),
  - activables/desactivables según necesidad operativa.
- **Vigilancia automática de novedades**:
  - comparación semanal contra snapshot histórico por perfil,
  - envío de solo convocatorias nuevas o relevantes (menos ruido).
- **Resumen accionable interno**:
  - email semanal con top resultados por perfil y enlaces directos al detalle interno.

## Modelo de datos ajustado (sin tabla de usuarios)

Tablas mínimas sugeridas (enfoque multi-alerta):

- `alert_profiles` (configuración de cada alerta: nombre, estado, filtros).
- `notification_recipients` (lista fija de emails internos).
- `grants_snapshot` (convocatorias vistas por perfil para deduplicación).
- `alerts_history` (histórico de envíos por perfil y resultados incluidos).

## Bloques de implementación (orientados a aprendizaje)

### Bloque 1 - Base del proyecto y Docker

**Qué aprenderás**: por qué contenerizar desde el inicio y cómo separar servicios.

- Crear proyecto Next.js con TypeScript.
- Añadir `Dockerfile` para app y `docker-compose` con app + postgres.
- Levantar entorno local reproducible con un único comando.

### Bloque 2 - Integración BDNS (BFF)

**Qué aprenderás**: desacoplar API externa con una capa propia.

- Crear cliente BDNS en backend.
- Normalizar respuesta y gestionar errores/reintentos.
- Exponer endpoint interno `/api/grants/search`.

### Bloque 3 - Front de búsqueda y detalle

**Qué aprenderás**: flujo completo front-back y estado de filtros.

- UI de filtros globales + listado paginado.
- Página de detalle de convocatoria.
- Manejo de estados: loading, vacío, error.

### Bloque 4 - Configuración interna de alertas (multi-perfil)

**Qué aprenderás**: persistencia de configuración operativa.

- Pantalla/admin interna simple para:
  - crear/editar/desactivar perfiles de alerta,
  - definir filtros por perfil (texto, administración, CCAA, fechas),
  - gestionar lista fija de destinatarios.
- Guardado en PostgreSQL de perfiles y configuración.

### Bloque 5 - Motor semanal de alertas (multi-perfil)

**Qué aprenderás**: jobs periódicos e idempotencia.

- Job semanal (cron) que consulta BDNS para cada perfil activo.
- Detección de nuevas convocatorias respecto a `grants_snapshot` por perfil.
- Registro en `alerts_history` y envío de email resumen por perfil (o consolidado).
- El email prioriza valor operativo:
  - destacar nuevas convocatorias relevantes por perfil,
  - reducir ruido con deduplicación y resumen corto accionable.

## Estado actual resumido

- Bloque 1: **Completado**.
- Bloque 2: **Completado**.
- Bloque 3: **Completado** (buscador con filtros, detalle en modal, persistencia de perfil base).
- Bloque 4: **En progreso** (migración de perfil único a multi-alerta).
- Bloque 5-7: **Pendiente**.

### Bloque 6 - Hardening para uso interno

**Qué aprenderás**: calidad mínima operativa antes de escalar.

- Validación de entrada y rate limit básico.
- Logs estructurados y trazabilidad de jobs.
- Caché de consultas frecuentes para mejorar tiempos.

### Bloque 7 - Preparación para futura venta (sin sobreingeniería)

**Qué aprenderás**: diseñar para evolución.

- Mantener separación clara entre UI, dominio e integración BDNS.
- Externalizar configuración por variables de entorno.
- Dejar base lista para introducir multi-tenant/usuarios más adelante sin rehacer todo.

## Organización de seguimiento para tu supervisor

En lugar de “entregables”, usaremos un estado por bloque:

- **Pendiente**
- **En progreso**
- **Completado**

Y en cada bloque reportarás:

- qué funcionalidad ya opera,
- qué riesgo técnico detectaste,
- siguiente paso inmediato.

## Riesgos principales y mitigación

- **Cambios/límites BDNS** -> encapsulación en BFF + caché + reintentos.
- **Ruido en alertas** -> filtros globales bien definidos + deduplicación por identificador/hash.
- **Migración a servidor** -> Docker Compose y variables de entorno desde inicio.

## Recomendaciones pedagógicas (como vamos a trabajar)

- Avanzar en iteraciones pequeñas (1 bloque cada vez).
- Antes de cada bloque: mini explicación conceptual (5-10 min).
- Después de cada bloque: prueba práctica contigo y resolución de dudas.
- Si una tecnología es nueva para ti, añadimos una “versión mínima funcional” antes de optimizar.

