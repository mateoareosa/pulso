# ADR-002: Estrategia Offline, Sincronización e Idempotencia

## Estado

Aceptado

## Contexto

Los kioscos y puntos de venta minoristas experimentan cortes intermitentes de conectividad a internet, baja latencia variable y reinicios accidentales de terminales.
Una venta iniciada en el mostrador físico no puede cancelarse ni detener la atención al cliente debido a un corte momentáneo de red. Al mismo tiempo:

1. Reintentar una venta no debe jamás generar duplicaciones de cobro, ventas duplicadas ni decrementos dobles de stock.
2. La interfaz de usuario no debe mentir: una venta almacenada localmente no debe fingir haber sido confirmada en el servidor central.
3. Deben manejarse conflictos de versión (ej. cambio de turno, discrepancia de catálogo) de manera explícita y auditable.

## Decisión

Implementamos una estrategia de **Offline-First Operacional con Idempotencia Fuerte de Extremo a Extremo**:

1. **Clave de Idempotencia del Cliente (Client Idempotency Key)**:
   - Toda operación mutativa (venta, movimiento de caja) genera un UUID v4 (`idempotencyKey`) en el dispositivo cliente antes de procesarse o almacenarse.
   - El backend registra cada clave procesada en la tabla `IdempotencyRecord` asociada al `tenantId`.
   - Si la API recibe una petición con una clave ya procesada, devuelve el resultado original de forma determinista con código HTTP 200 y cabecera `X-Cache-Lookup: HIT`, sin volver a ejecutar los efectos colaterales (stock/caja).

2. **Almacenamiento Local Seguro (Dexie sobre IndexedDB)**:
   - La aplicación web almacena en el cliente: catálogo mínimo cacheado, identificador de turno activo y la cola de operaciones pendientes (`sync_queue`).
   - Cada elemento en cola contiene: `operationId`, `deviceId`, `tenantId`, `locationId`, `type`, `payload`, `localTimestamp` y `schemaVersion`.

3. **Ciclo de Vida de Sincronización**:
   - Estados visuales explícitos comunicados en `OperationalRibbon`:
     - **ONLINE**: conexión activa y cola vacía.
     - **OFFLINE**: conexión caída; operaciones agregadas a la cola local con confirmación local visible.
     - **SYNCING**: reconexión detectada; vaciado secuencial de la cola hacia el backend.
     - **ERROR / CONFLICT**: ante conflicto irresoluble, la venta se preserva intacta en el libro local y genera un `SyncConflict` en el backend para resolución supervisada, sin pérdida silenciosa de datos.

## Consecuencias

### Positivas

- Cero interrupciones en la atención al cliente ante microcortes o caídas de internet.
- Cero duplicación de ventas y movimientos de caja gracias al ledger de idempotencia.
- Trazabilidad y visibilidad total para el operador y el administrador.

### Negativas / Mitigaciones

- Posibles ventas con datos de catálogo desactualizados si la desconexión es prolongada. Mitigado alertando en la cinta operativa cuando la última sincronización supera el umbral configurable.
