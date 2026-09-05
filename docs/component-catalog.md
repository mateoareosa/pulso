# Pulso — Catálogo de Componentes "Mostrador vivo"

## Decisión sobre Catálogo Visual vs. Storybook en Etapa 0

El Plan Maestro establece: _"Storybook o catálogo equivalente de componentes"_.
Para la **Etapa 0**, implementamos un catálogo nativo interactivo (`ComponentCatalog`) en `@pulso/ui` por las siguientes razones arquitectónicas:

1. **Cero sobrecarga de dependencias**: Storybook 8 en monorepos con React 19 y Tailwind puede acarrear cientos de dependencias secundarias y demoras en el ciclo de build de CI.
2. **Pruebas en vivo con tokens de diseño**: el catálogo nativo opera directamente sobre los tokens semánticos CSS (`OKLCH`), permitiendo alternar en vivo entre el tema diurno (`Ticket`) y nocturno (`Night/Petróleo`).
3. **Exhibición explícita de los 6 estados del sistema**:
   - **Estado 1 — Vacío**: Ticket en blanco con instrucciones de escaneo y atajo `F2`.
   - **Estado 2 — Venta Activa**: Ticket en construcción con ítems dinámicos, selección activa y totales tabulares.
   - **Estado 3 — Offline**: Cinta operativa persistente en tono tomate con advertencia operativa y contador de operaciones locales pendientes.
   - **Estado 4 — Sincronizando**: Indicador rotatorio de replay de cola hacia el servidor.
   - **Estado 5 — Error / Conflicto**: Resguardo de la venta en contingencia sin pérdidas silenciosas.
   - **Estado 6 — Éxito (Sello de Venta)**: Comprobante en pantalla con desglose de total, recibido y vuelto.
4. **Pestañas por componente aislado**:
   - `OperationalRibbon`: conmutador interactivo de estados de conexión (online, offline, syncing).
   - `LiveReceipt`: control interactivo de agregado, modificación de cantidades y eliminación.
   - `MoneyKeypad`: teclado numérico, cálculo reactivo de vuelto y confirmación.

## Cómo Ejecutar y Revisar el Catálogo

1. Iniciar la aplicación web:
   ```bash
   pnpm --filter @pulso/web dev
   ```
2. En la barra superior de desarrollo, hacer clic en **"CATÁLOGO DE COMPONENTES"**.
3. Utilizar las pestañas superiores para navegar entre los estados del sistema o inspeccionar cada componente de manera aislada.

## Evaluación para Etapas Futuras

Para la **Etapa 2 (Producto comercial estable)**, cuando se incorporen decenas de componentes administrativos (tablas densas, selectores de proveedores, filtros de auditoría) y se requieran pruebas de regresión visual automatizadas con Chromatic, se evaluará la incorporación de Storybook dedicado dentro de `packages/ui` sin alterar los componentes existentes.
