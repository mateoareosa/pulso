import React, { useState } from 'react';
import { SalesScreen } from './features/sales/components/SalesScreen';
import { OperationalRibbon } from '@pulso/ui';
import { useSalesStore } from './features/sales/store/sales.store';
import { PwaInstallPrompt } from './features/pwa/PwaInstallPrompt';

export const App: React.FC = () => {
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
        onToggleConnection={toggleConnection}
        onSyncClick={syncPendingSales}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        <PwaInstallPrompt />
      </OperationalRibbon>

      {/* Main View Area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SalesScreen />
      </div>
    </div>
  );
};
