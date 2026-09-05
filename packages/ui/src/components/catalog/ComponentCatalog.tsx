import React, { useState } from 'react';
import { OperationalRibbon } from '../operational-ribbon/OperationalRibbon';
import { LiveReceipt, ReceiptItem } from '../live-receipt/LiveReceipt';
import { MoneyKeypad } from '../money-keypad/MoneyKeypad';
import { IconCheck, IconAlert, IconDay, IconNight } from '@pulso/icons';

type CatalogTab = 'states' | 'receipt' | 'ribbon' | 'keypad';

const SAMPLE_ITEMS: ReceiptItem[] = [
  {
    id: '1',
    productId: 'p1',
    name: 'Gaseosa Cola 500ml',
    quantity: 2,
    unitPriceFormatted: '$ 1.200,00',
    totalPriceFormatted: '$ 2.400,00',
    barcode: '7791234567890',
  },
  {
    id: '2',
    productId: 'p2',
    name: 'Turrón de Maní 25g',
    quantity: 1,
    unitPriceFormatted: '$ 450,00',
    totalPriceFormatted: '$ 450,00',
    barcode: '7799876543210',
  },
  {
    id: '3',
    productId: 'p3',
    name: 'Chicles Menta Fuerte',
    quantity: 3,
    unitPriceFormatted: '$ 300,00',
    totalPriceFormatted: '$ 900,00',
  },
];

export interface ComponentCatalogProps {
  theme?: 'light' | 'night';
  onToggleTheme?: () => void;
}

export const ComponentCatalog: React.FC<ComponentCatalogProps> = ({
  theme: externalTheme,
  onToggleTheme: externalToggleTheme,
}) => {
  const [activeTab, setActiveTab] = useState<CatalogTab>('states');
  const [demoStatus, setDemoStatus] = useState<'online' | 'offline' | 'syncing'>('online');
  const [items, setItems] = useState<ReceiptItem[]>(SAMPLE_ITEMS);
  const [localTheme, setLocalTheme] = useState<'light' | 'night'>('light');

  const currentTheme = externalTheme ?? localTheme;
  const handleToggleTheme =
    externalToggleTheme ?? (() => setLocalTheme((t) => (t === 'light' ? 'night' : 'light')));

  const tabs: Array<{ key: CatalogTab; label: string }> = [
    { key: 'states', label: 'ESTADOS DEL SISTEMA (6 ESTADOS)' },
    { key: 'receipt', label: 'TICKET VIVO (LIVERECEIPT)' },
    { key: 'ribbon', label: 'CINTA OPERATIVA (OPERATIONALRIBBON)' },
    { key: 'keypad', label: 'COBRO EN EFECTIVO (MONEYKEYPAD)' },
  ];

  return (
    <div
      data-theme={currentTheme}
      style={{
        padding: '24px 32px',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
        minHeight: 'calc(100vh - 50px)',
        fontFamily: 'var(--font-sans)',
        overflowY: 'auto',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Catalog Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid var(--color-ink)',
            paddingBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 'var(--text-2xl)',
                fontWeight: 900,
                letterSpacing: '-0.5px',
              }}
            >
              Pulso — Catálogo de Componentes "Mostrador vivo"
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                color: 'var(--color-ink-muted)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Tokens semánticos OKLCH, escala tipográfica dual (Archivo / IBM Plex Mono) y
              componentes en aislamiento.
            </p>
          </div>

          {/* Theme Switcher Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                color: 'var(--color-ink-muted)',
              }}
            >
              TEMA VISUAL:
            </span>
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={`Cambiar a modo ${currentTheme === 'light' ? 'noche' : 'día'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                border: '2px solid var(--color-ink)',
                backgroundColor:
                  currentTheme === 'night' ? 'var(--color-ink)' : 'var(--color-ticket)',
                color: currentTheme === 'night' ? 'var(--color-ticket)' : 'var(--color-ink)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.6px',
                boxShadow: 'var(--shadow-key)',
              }}
            >
              {currentTheme === 'night' ? (
                <>
                  <IconNight size={16} aria-hidden="true" />
                  <span>MODO NOCHE (AZUL PETRÓLEO)</span>
                </>
              ) : (
                <>
                  <IconDay size={16} aria-hidden="true" />
                  <span>MODO DÍA (TICKET TÉRMICO)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="pulso-catalog-tabs" aria-label="Secciones del catálogo">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className="pulso-catalog-tab-btn"
              aria-current={activeTab === t.key ? 'page' : undefined}
              style={{
                backgroundColor: activeTab === t.key ? 'var(--color-ink)' : 'var(--color-surface)',
                color: activeTab === t.key ? 'var(--color-ticket)' : 'var(--color-ink)',
                boxShadow: activeTab === t.key ? 'none' : 'var(--shadow-key)',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab 1: States Comparison Grid */}
        {activeTab === 'states' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
              gap: '24px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {/* Estado 1: Vacío */}
            <article
              style={{
                border: '2px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: 'var(--color-surface-sunken)',
                    border: '1px solid var(--color-ink)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  ESTADO 1
                </span>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '8px 0 4px' }}>
                  Mostrador Vacío (Esperando Escaneo)
                </h2>
                <p
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}
                >
                  Propósito: terminal lista para recibir ítems con atajo rápido <kbd>F2</kbd>. Cero
                  distracciones.
                </p>
              </div>
              <div
                style={{
                  height: '420px',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                }}
              >
                <LiveReceipt items={[]} totalFormatted="$ 0,00" />
              </div>
            </article>

            {/* Estado 2: Venta Activa */}
            <article
              style={{
                border: '2px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: 'var(--color-pulse-soft)',
                    border: '1px solid var(--color-pulse-border)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  ESTADO 2
                </span>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '8px 0 4px' }}>
                  Venta Activa (Ticket Vivo en Construcción)
                </h2>
                <p
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}
                >
                  Propósito: construcción interactiva con resaltado de selección, modificación de
                  cantidad y total dominante.
                </p>
              </div>
              <div
                style={{
                  height: '420px',
                  border: '1px solid var(--color-border)',
                  overflow: 'hidden',
                }}
              >
                <LiveReceipt
                  items={items}
                  totalFormatted="$ 3.750,00"
                  selectedItemId="2"
                  onQuantityChange={(id, delta) => {
                    setItems((prev) =>
                      prev.map((it) =>
                        it.id === id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it
                      )
                    );
                  }}
                  onRemoveItem={(id) => setItems((prev) => prev.filter((it) => it.id !== id))}
                />
              </div>
            </article>

            {/* Estado 3: Offline */}
            <article
              style={{
                border: '2px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: 'var(--color-tomato-soft)',
                    border: '1px solid var(--color-tomato-border)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  ESTADO 3
                </span>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '8px 0 4px' }}>
                  Conexión Interrumpida (Offline)
                </h2>
                <p
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}
                >
                  Propósito: advertencia transparente en tono tomate, contador de ventas locales
                  encoladas y operación continua.
                </p>
              </div>
              <div style={{ width: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
                <OperationalRibbon
                  connectionStatus="offline"
                  pendingSyncCount={4}
                  shiftLabel="Turno Tarde #14"
                  operatorName="Mateo"
                  expectedCashFormatted="$ 45.200,00"
                  alertMessage="Modo offline activo: ventas guardadas localmente"
                />
              </div>
            </article>

            {/* Estado 4: Sincronizando */}
            <article
              style={{
                border: '2px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: 'var(--color-amber-soft)',
                    border: '1px solid var(--color-amber-border)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  ESTADO 4
                </span>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '8px 0 4px' }}>
                  Sincronización en Curso
                </h2>
                <p
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}
                >
                  Propósito: retransmisión idempotente de operaciones pendientes al reconectar con
                  animación de rotación limpia.
                </p>
              </div>
              <div style={{ width: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
                <OperationalRibbon
                  connectionStatus="syncing"
                  pendingSyncCount={2}
                  shiftLabel="Turno Tarde #14"
                  operatorName="Mateo"
                  expectedCashFormatted="$ 48.950,00"
                />
              </div>
            </article>

            {/* Estado 5: Error / Conflicto */}
            <article
              style={{
                border: '2px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: 'var(--color-tomato-soft)',
                    border: '1px solid var(--color-tomato-border)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  ESTADO 5
                </span>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '8px 0 4px' }}>
                  Advertencia Operativa / Conflicto
                </h2>
                <p
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}
                >
                  Propósito: alerta explícita preservando el ticket activo sin pérdidas de datos.
                </p>
              </div>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--color-tomato-soft)',
                  border: '2px solid var(--color-tomato-solid)',
                  color: 'var(--color-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderRadius: 'var(--radius-xs)',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                <IconAlert
                  size={24}
                  style={{ color: 'var(--color-tomato-solid)', flexShrink: 0 }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ fontWeight: 800, fontSize: 'var(--text-sm)', letterSpacing: '0.5px' }}
                  >
                    ERROR DE COMUNICACIÓN (ID: ERR-409-CONFLICT)
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      marginTop: '2px',
                      color: 'var(--color-ink-muted)',
                    }}
                  >
                    La venta fue resguardada en cola local con clave idempotente. No se duplicará al
                    reintentar.
                  </div>
                </div>
              </div>
            </article>

            {/* Estado 6: Éxito (Sello de Venta) */}
            <article
              style={{
                border: '2px solid var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflow: 'hidden',
                minWidth: 0,
                boxSizing: 'border-box',
              }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: 'var(--color-pulse-soft)',
                    border: '1px solid var(--color-pulse-border)',
                    padding: '2px 8px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  ESTADO 6
                </span>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '8px 0 4px' }}>
                  Sello de Venta Confirmada
                </h2>
                <p
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', margin: 0 }}
                >
                  Propósito: confirmación sobria con número de ticket, importe pagado y vuelto
                  calculado.
                </p>
              </div>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--color-pulse-soft)',
                  border: '2px solid var(--color-pulse-border)',
                  color: 'var(--color-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderRadius: 'var(--radius-xs)',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                <IconCheck size={26} style={{ color: 'var(--color-pulse-solid)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{ fontWeight: 800, fontSize: 'var(--text-sm)', letterSpacing: '0.5px' }}
                  >
                    VENTA REGISTRADA EXITOSAMENTE #SALE-A91B82
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: '3px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    Total: $ 3.750,00 | Recibido: $ 5.000,00 | Vuelto: $ 1.250,00
                  </div>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* Tab 2: LiveReceipt Inspection */}
        {activeTab === 'receipt' && (
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <LiveReceipt
              items={items}
              totalFormatted="$ 3.750,00"
              onQuantityChange={(id, delta) => {
                setItems((prev) =>
                  prev.map((it) =>
                    it.id === id ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it
                  )
                );
              }}
              onRemoveItem={(id) => setItems((prev) => prev.filter((it) => it.id !== id))}
            />
          </div>
        )}

        {/* Tab 3: OperationalRibbon Inspection */}
        {activeTab === 'ribbon' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>SIMULAR ESTADO:</span>
              {(['online', 'offline', 'syncing'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setDemoStatus(st)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--color-ink)',
                    backgroundColor:
                      demoStatus === st ? 'var(--color-ink)' : 'var(--color-surface)',
                    color: demoStatus === st ? 'var(--color-ticket)' : 'var(--color-ink)',
                    fontWeight: 700,
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                  }}
                >
                  {st.toUpperCase()}
                </button>
              ))}
            </div>
            <OperationalRibbon
              connectionStatus={demoStatus}
              pendingSyncCount={demoStatus === 'offline' ? 3 : demoStatus === 'syncing' ? 1 : 0}
              shiftLabel="Turno Tarde #14"
              operatorName="Mateo"
              expectedCashFormatted="$ 45.200,00"
              theme={currentTheme}
              onToggleTheme={handleToggleTheme}
            />
          </div>
        )}

        {/* Tab 4: MoneyKeypad Inspection */}
        {activeTab === 'keypad' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MoneyKeypad
              totalCents={375000}
              onConfirmTender={(data) => {
                alert(
                  `Cobro confirmado: Recibido $${data.receivedCents / 100}, Vuelto: $${data.changeCents / 100}`
                );
              }}
              onCancel={() => alert('Cobro cancelado')}
            />
          </div>
        )}
      </div>
    </div>
  );
};
