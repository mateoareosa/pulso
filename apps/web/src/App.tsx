import React, { useState } from 'react';
import { SalesScreen } from './features/sales/components/SalesScreen';
import { ComponentCatalog } from '@pulso/ui';

export const App: React.FC = () => {
  const [view, setView] = useState<'sales' | 'catalog'>('sales');

  return (
    <div>
      {/* Top Dev/Review Bar */}
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 16px',
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
          fontSize: '0.75rem',
          fontFamily: 'monospace',
          borderBottom: '1px solid #334155',
        }}
      >
        <div>
          <strong>PULSO MVP — ETAPA 0</strong> [Mostrador vivo]
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setView('sales')}
            style={{
              padding: '2px 8px',
              backgroundColor: view === 'sales' ? '#22c55e' : '#1e293b',
              color: view === 'sales' ? '#0f172a' : '#f8fafc',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            PANTALLA DE VENTA (PROTOTIPO)
          </button>
          <button
            onClick={() => setView('catalog')}
            style={{
              padding: '2px 8px',
              backgroundColor: view === 'catalog' ? '#22c55e' : '#1e293b',
              color: view === 'catalog' ? '#0f172a' : '#f8fafc',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            CATÁLOGO DE COMPONENTES
          </button>
        </div>
      </nav>

      {view === 'sales' ? <SalesScreen /> : <ComponentCatalog />}
    </div>
  );
};
