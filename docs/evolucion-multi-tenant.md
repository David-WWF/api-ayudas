# Evolución hacia multi-tenant o usuarios (bloque 7)

Este documento fija **criterios de arquitectura** para poder comercializar o añadir organizaciones/usuarios **sin reescribir** el núcleo. No implementa autenticación ni tablas nuevas: describe límites de capas y un posible orden de trabajo.

## Capas actuales (después del bloque 7)

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| **UI** | `web/src/app/**/*.tsx` | Presentación, estado local, llama solo a `/api/*` o rutas internas. |
| **BFF (HTTP)** | `web/src/app/api/**/route.ts` | Validación de request, códigos HTTP, orquestación; delega en dominio + integraciones. |
| **Dominio** | `web/src/lib/domain/*` | Tipos y reglas puras (p. ej. `AlertFilters`, normalización desde JSON). Sin `fetch`, sin Next. |
| **Integración BDNS** | `web/src/lib/bdns/*` | HTTP hacia PAP/BDNS, URLs base, detalle, regiones, búsqueda, caché. |
| **Integración alertas** | `web/src/lib/alerts/*` | Job, SMTP, Telegram, destinatarios, reintentos. |
| **Persistencia** | `web/src/lib/db.ts` + SQL en runners/rutas | PostgreSQL; hoy sin `tenant_id`. |

**Configuración y secretos:** solo variables de entorno (y BD para datos operativos no secretos). No hay credenciales de SMTP/bot en tablas.

## Qué tocaría un multi-tenant “de verdad”

1. **Modelo de datos**  
   Añadir `tenant_id` (o `organization_id`) a: `alert_profiles`, `notification_recipients`, `grants_snapshot`, `alerts_history`, `global_filters` (o sustituir la fila única por una por tenant).  
   Decidir si el job corre **una vez por tenant** o **un solo proceso** que itera tenants.

2. **Autenticación y contexto**  
   Middleware o capa BFF que resuelva el tenant actual (JWT, sesión, subdominio, etc.) y lo inyecte en consultas SQL (`WHERE tenant_id = $ctx`).

3. **Aislamiento**  
   Preferible **filtrado explícito en aplicación** o **Row Level Security (RLS)** en PostgreSQL para evitar fugas entre clientes.

4. **Scheduler**  
   Hoy un solo `ALERTS_AUTORUN_CRON` para todo el sistema. Con multi-tenant podría:  
   - un cron que lista tenants y ejecuta el runner por cada uno, o  
   - colas (futuro) por tenant.

5. **BFF**  
   Las rutas `/api/settings/*` deberían exigir contexto de tenant; la integración BDNS puede seguir **compartida** (misma API pública) salvo límites legales/comerciales.

## Qué no hace falta anticipar ahora

- No es obligatorio crear tablas `tenants` o `users` hasta tener requisitos claros.  
- No hace falta abstraer PostgreSQL detrás de un repositorio completo si el equipo prefiere SQL directo; sí conviene **centralizar** el acceso por rutas conocidas para añadir `tenant_id` en un solo paso.

## Checklist antes de vender el producto

- [ ] Revisión de **uso de datos BDNS** (condiciones del portal / legal).  
- [ ] **Backups** y recuperación en el entorno de despliegue.  
- [ ] Política de **secretos** rotación SMTP/Telegram/job.  
- [ ] Si hay red expuesta: **TLS**, firewall y `ALERTS_RUN_SECRET` obligatorio.

## Referencias en código

- Dominio: `web/src/lib/domain/`  
- BDNS centralizado: `web/src/lib/bdns/urls.ts`, `client.ts`, `detail.ts`, `regions.ts`  
- Job: `web/src/lib/alerts/weekly-runner.ts`
