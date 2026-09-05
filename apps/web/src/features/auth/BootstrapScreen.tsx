import React from 'react';

export const BootstrapScreen: React.FC = () => {
  return (
    <main
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          fontWeight: 900,
          letterSpacing: '1.5px',
          backgroundColor: 'var(--color-pulse-solid)',
          color: '#0f172a',
          padding: '4px 12px',
          borderRadius: 'var(--radius-xs)',
          fontSize: 'var(--text-sm)',
          textTransform: 'uppercase',
          marginBottom: '16px',
        }}
      >
        PULSO
      </div>
      <div
        style={{
          fontSize: 'var(--text-base)',
          color: 'var(--color-ink-muted)',
          fontWeight: 600,
        }}
      >
        Comprobando sesión de mostrador...
      </div>
    </main>
  );
};
