# Pulso — Arquitectura Offline-First y Capacidades PWA

## Visión Operativa

En un entorno de kiosco o mostrador minorista, la conectividad no es una garantía fija. Los cortes de red y la inestabilidad del proveedor de internet son habituales.
Pulso implementa una **estrategia offline-first consciente**:

- La aplicación web nunca se detiene ante un corte de conexión.
- La aplicación comunica su estado de forma transparente sin fingir sincronizaciones remotas.
- Todas las operaciones locales son idempotentes y no se duplican al reconectar.

---

## 1. Qué Funciona 100% Offline (Dispositivo Desconectado)

| Funcionalidad               | Mecanismo Offline                            | Garantía Técnica                                                                                      |
| :-------------------------- | :------------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **Carga de la Aplicación**  | Service Worker (`vite-plugin-pwa` + Workbox) | El shell completo (HTML, CSS, JS, fuentes e iconos) se sirve desde cache local.                       |
| **PWA Instalable**          | Web App Manifest + Service Worker            | Puede instalarse como aplicación de escritorio o móvil independiente sin barra de navegador.          |
| **Búsqueda y Escaneo**      | Catálogo en memoria / IndexedDB              | Búsqueda inmediata por código de barras y texto sin latencia de red.                                  |
| **Construcción del Ticket** | `LiveReceipt` + Zustand                      | Agregado, modificación de cantidades y eliminación de ítems de la venta activa.                       |
| **Cálculo de Dinero**       | Value Object `Money` (en centavos)           | Cálculo exacto de subtotal, total y vuelto sin errores de punto flotante.                             |
| **Cobro en Efectivo**       | `MoneyKeypad`                                | Teclado numérico, botones de acceso rápido ($1.000, $2.000, $5.000) y cálculo dinámico de cambio.     |
| **Registro de Venta Local** | Cola `syncQueue` en IndexedDB (Dexie)        | Cada venta se persiste localmente con `idempotencyKey` UUID v4 antes de confirmar.                    |
| **Sello de Venta**          | Modal de éxito visual                        | Entrega comprobante en pantalla con estado `VENTA GUARDADA LOCAL` e ID de idempotencia.               |
| **Cinta Operativa**         | `OperationalRibbon`                          | Estado explícito `SIN CONEXIÓN` (en rojo tomate) y contador en tiempo real de operaciones pendientes. |

---

## 2. Qué Requiere Conectividad (Backend Requerido)

| Funcionalidad                       | Comportamiento sin Conexión                                            | Solución al Reconectar                                                                                                                        |
| :---------------------------------- | :--------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sincronización Centralizada**     | Las ventas se acumulan en la cola local de IndexedDB.                  | Al recuperar conexión, la cinta pasa a `SINCRONIZANDO` y envía el lote al endpoint `/sync/batch`.                                             |
| **Respaldo en Nube**                | Los datos residen en el almacenamiento del navegador del dispositivo.  | La API persiste en PostgreSQL dentro de la transacción multi-tenant.                                                                          |
| **Actualización Remota de Precios** | Se utiliza el precio vigente en la terminal al momento de desconexión. | Al sincronizar, si existiese conflicto de precio, se genera un registro de conciliación supervisado sin anular la venta física ya concretada. |
| **Inicio de Sesión Inicial**        | Requiere validar credenciales contra el backend por primera vez.       | Una vez autenticado, la sesión y el turno quedan cacheados para operación continua.                                                           |

---

## 3. Garantías contra Duplicación (Idempotencia)

- Cada comando de venta genera un identificador `idempotencyKey` en el navegador antes de cualquier persistencia.
- Al reconectar y retransmitir la cola hacia la API (`POST /sync/batch` o `POST /sales`):
  1. Si la venta no existía en el servidor, se inserta atómicamente.
  2. Si la petición ya había llegado antes del corte (falla de respuesta de red), el backend detecta la clave en `IdempotencyRecord` y devuelve el resultado original con bandera `idempotentReplay: true`, sin volver a descontar stock ni duplicar la caja.
