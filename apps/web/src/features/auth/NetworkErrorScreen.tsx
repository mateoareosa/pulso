import React from 'react';

interface NetworkErrorScreenProps {
  onRetry: () => void;
}

export const NetworkErrorScreen: React.FC<NetworkErrorScreenProps> = ({ onRetry }) => {
  return (
    <main
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--color-surface-raised)',
          border: '2px solid var(--color-tomato-border, #f87171)',
          borderRadius: 'var(--radius-sm)',
          padding: '28px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            fontWeight: 900,
            letterSpacing: '1.5px',
            backgroundColor: 'var(--color-tomato-solid)',
            color: '#ffffff',
            padding: '4px 12px',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-xs)',
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}
        >
          SIN CONEXIÓN AL SERVIDOR
        </div>
        <h1
          style={{
            fontSize: '1.3rem',
            fontWeight: 800,
            margin: '0 0 10px 0',
          }}
        >
          No se pudo conectar con la API
        </h1>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-ink-muted)',
            marginBottom: '24px',
          }}
        >
          No pudimos verificar tu sesión porque el servidor no responde. Comprobá que los servicios
          estén activos.
        </p>

        <button
          type="button"
          onClick={onRetry}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: 'var(--color-pulse-solid)',
            color: '#0f172a',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-base)',
            fontWeight: 800,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          REINTENTAR CONEXIÓN
        </button>
      </div>
    </main>
  );
};
