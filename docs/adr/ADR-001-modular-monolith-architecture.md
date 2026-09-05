# ADR-001: Arquitectura Modular Monolítica

## Estado

Aceptado

## Contexto

El sistema Pulso está diseñado para operar el punto de venta, inventario y caja de comercios minoristas (iniciando con kioscos de alta rotación).
Existe la tentación en la industria de adoptar microservicios de manera prematura. Sin embargo, en un sistema de mostrador operativo:

1. Las operaciones de Venta, Caja y Stock requieren transaccionalidad atómica estricta (ACID) en la misma base de datos.
2. Los costos operativos de red, latencia inter-servicio, consistencia eventual descontrolada y sobrecarga de infraestructura atentan contra el principio rector de "vender en menos de 15 segundos sin fricción".
3. El equipo de desarrollo necesita velocidad de iteración, refactorización segura con tipado estricto extremo a extremo y despliegue unificado.

## Decisión

Adoptamos una **Arquitectura Modular Monolítica** (Modular Monolith) contenida en un monorepo administrado con `pnpm` workspaces y Turborepo:

1. **Un solo runtime de backend (apps/api)** estructurado en módulos de dominio desacoplados (`sales`, `cash`, `inventory`, `catalog`, `identity`, `sync`, `audit`).
2. **Límites de módulo estrictos**:
   - Cada módulo encapsula sus tablas internas y lógica de negocio.
   - La comunicación entre módulos se realiza exclusivamente a través de interfaces públicas / servicios de aplicación definidos y DTOs en `packages/contracts`.
   - Prohibido hacer consultas o joins directos a tablas operacionales de otros módulos sin un contrato formal.
3. **Persistencia única transaccional**:
   - Base de datos PostgreSQL compartida con esquema multi-tenant (`tenantId` y `locationId` obligatorios).
   - Transacciones unificadas en el límite de la aplicación para ventas que afecten stock y caja de forma atómica.
4. **Desacoplamiento de eventos secundarios**:
   - Las acciones que no requieran atomicidad inmediata (telemetría, notificaciones, auditoría asíncrona) utilizarán el patrón Outbox transaccional.

## Consecuencias

### Positivas

- **Latencia mínima y máxima velocidad**: sin llamadas de red internas ni serialization overhead para operaciones críticas de venta.
- **Transaccionalidad garantizada**: ventas, stock y caja se asientan sin inconsistencias ni estados huérfanos.
- **Simplicidad operativa**: un único contenedor de API, una base de datos PostgreSQL y despliegues atómicos.
- **Evolución limpia**: si en el futuro un módulo específico (ej. analítica masiva o catálogo distribuido) necesita escalar de forma independiente, sus límites modulares ya están trazados.

### Negativas / Mitigaciones

- **Disciplina de límites**: se requiere control continuo mediante linter y code reviews para evitar acoplamiento accidental entre módulos internos. Mitigado mediante contratos en `packages/contracts` y capas de dominio en `packages/domain`.
