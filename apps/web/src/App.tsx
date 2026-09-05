import React, { useState } from 'react';
import { SalesScreen } from './features/sales/components/SalesScreen';
import { ComponentCatalog, OperationalRibbon } from '@pulso/ui';
import { useSalesStore } from './features/sales/store/sales.store';
import { PwaInstallPrompt } from './features/pwa/PwaInstallPrompt';

export const App: React.FC = () => {
  const [view, setView] = useState<'sales' | 'catalog'>('sales');
  const [theme, setTheme] = useState<'light' | 'night'>('light');
  const { connectionStatus, pendingSyncCount, toggleConnection, syncPendingSales } =
    useSalesStore();

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'night' : 'light'));
  };

  return (
    <div
      data-theme={theme}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
      }}
    >
      {/* Refined Unified Operational Header */}
      <OperationalRibbon
        connectionStatus={connectionStatus}
        pendingSyncCount={pendingSyncCount}
        shiftLabel="Turno Tarde #14"
        operatorName="Mateo (Cajero)"
        expectedCashFormatted="$ 45.200,00"
        activeSection={view}
        onSectionChange={setView}
        onToggleConnection={toggleConnection}
        onSyncClick={syncPendingSales}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        <PwaInstallPrompt />
      </OperationalRibbon>

      {/* Main View Area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'sales' ? (
          <SalesScreen />
        ) : (
          <ComponentCatalog theme={theme} onToggleTheme={toggleTheme} />
        )}
      </div>
    </div>
  );
};
