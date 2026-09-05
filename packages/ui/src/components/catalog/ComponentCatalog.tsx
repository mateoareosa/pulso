import React, { useState } from 'react';
import { OperationalRibbon } from '../operational-ribbon/OperationalRibbon';
import { LiveReceipt, ReceiptItem } from '../live-receipt/LiveReceipt';
import { MoneyKeypad } from '../money-keypad/MoneyKeypad';
import { IconCheck, IconAlert } from '@pulso/icons';

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

export const ComponentCatalog: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ribbon' | 'receipt' | 'keypad' | 'states'>('states');
  const [demoStatus, setDemoStatus] = useState<'online' | 'offline' | 'syncing'>('online');
  const [items, setItems] = useState<ReceiptItem[]>(SAMPLE_ITEMS);
  const [theme, setTheme] = useState<'light' | 'night'>('light');

  return (
    <div
      data-theme={theme}
      style={{
        padding: '24px',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
        minHeight: '100vh',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            borderBottom: '2px solid var(--color-ink)',
            paddingBottom: '12px',
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
              Pulso — Catálogo de Componentes "Mostrador vivo"
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--color-ink-muted)', fontSize: '0.85rem' }}>
              Fundamentos visuales, tokens semánticos (OKLCH) y componentes operativos.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setTheme(theme === 'light' ? 'night' : 'light')}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--color-ink)',
                backgroundColor: 'var(--color-surface-sunken)',
                color: 'var(--color-ink)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              Modo: {theme === 'light' ? 'Día (Ticket)' : 'Noche (Petróleo)'}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {[
            { key: 'states', label: 'Estados del Sistema (6 Estados)' },
            { key: 'ribbon', label: 'OperationalRibbon' },
            { key: 'receipt', label: 'LiveReceipt' },
            { key: 'keypad', label: 'MoneyKeypad' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              style={{
                padding: '8px 16px',
                border: '2px solid var(--color-ink)',
                backgroundColor: activeTab === t.key ? 'var(--color-ink)' : 'var(--color-surface)',
                color: activeTab === t.key ? 'var(--color-ticket)' : 'var(--color-ink)',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.85rem',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: States */}
        {activeTab === 'states' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            <section>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                1. Estado Vacío (Mostrador listo esperando escaneo)
              </h3>
              <div style={{ maxWidth: '420px' }}>
                <LiveReceipt items={[]} totalFormatted="$ 0,00" />
              </div>
            </section>

            <section>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                2. Estado Venta Activa (Ticket vivo en construcción)
              </h3>
              <div style={{ maxWidth: '420px' }}>
                <LiveReceipt
                  items={SAMPLE_ITEMS}
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
            </section>

            <section>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                3. Estado Offline (Conexión inestable - cola de sincronización)
              </h3>
              <OperationalRibbon
                connectionStatus="offline"
                pendingSyncCount={4}
                shiftLabel="Turno Tarde #14"
                operatorName="Mateo"
                expectedCashFormatted="$ 45.200,00"
                alertMessage="Modo offline activo: las ventas se guardan localmente"
              />
            </section>

            <section>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                4. Estado Sincronizando (Replay de transacciones locales al reconectar)
              </h3>
              <OperationalRibbon
                connectionStatus="syncing"
                pendingSyncCount={2}
                shiftLabel="Turno Tarde #14"
                operatorName="Mateo"
                expectedCashFormatted="$ 48.950,00"
              />
            </section>

            <section>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                5. Estado Error / Conflicto (Preserva la venta sin pérdidas silenciosas)
              </h3>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--color-tomato-subtle)',
                  border: '2px solid var(--color-tomato)',
                  color: 'var(--color-ink)',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <IconAlert size={24} style={{ color: 'var(--color-tomato)' }} />
                <div>
                  <div style={{ fontWeight: 800 }}>
                    ERROR DE COMUNICACIÓN (ID: err-409-conflict)
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                    La venta fue resguardada en cola local con clave idempotente. No se duplicará al
                    reintentar.
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}
              >
                6. Estado Éxito (Sello de venta confirmada con vuelto)
              </h3>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--color-pulse-subtle)',
                  border: '2px solid var(--color-pulse)',
                  color: 'var(--color-ink)',
                  borderRadius: 'var(--radius-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <IconCheck size={24} style={{ color: 'var(--color-pulse)' }} />
                <div>
                  <div style={{ fontWeight: 800 }}>VENTA REGISTRADA EXITOSAMENTE #V-1049</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                    Total: $ 3.750,00 | Pagado: $ 5.000,00 | Vuelto: $ 1.250,00
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: Ribbon */}
        {activeTab === 'ribbon' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setDemoStatus('online')}
                style={{ padding: '4px 8px', cursor: 'pointer' }}
              >
                Online
              </button>
              <button
                onClick={() => setDemoStatus('offline')}
                style={{ padding: '4px 8px', cursor: 'pointer' }}
              >
                Offline
              </button>
              <button
                onClick={() => setDemoStatus('syncing')}
                style={{ padding: '4px 8px', cursor: 'pointer' }}
              >
                Syncing
              </button>
            </div>
            <OperationalRibbon
              connectionStatus={demoStatus}
              pendingSyncCount={demoStatus === 'offline' ? 3 : demoStatus === 'syncing' ? 1 : 0}
              shiftLabel="Turno Activo"
              operatorName="Cajero #1"
              expectedCashFormatted="$ 34.500,00"
            />
          </div>
        )}

        {/* Tab 3: Receipt */}
        {activeTab === 'receipt' && (
          <div style={{ maxWidth: '420px' }}>
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

        {/* Tab 4: Keypad */}
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
