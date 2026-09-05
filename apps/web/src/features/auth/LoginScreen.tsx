import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { ApiError } from '../../services/api-client';

interface LoginScreenProps {
  onGoToRegister: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onGoToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Credenciales inválidas. Compruebe su correo y contraseña.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error al iniciar sesión. Compruebe su conexión.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
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
          maxWidth: '420px',
          backgroundColor: 'var(--color-surface-raised)',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '32px 28px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Brand Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              fontWeight: 900,
              letterSpacing: '1.5px',
              backgroundColor: 'var(--color-pulse-solid)',
              color: '#0f172a',
              padding: '4px 12px',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-sm)',
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}
          >
            PULSO
          </div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              margin: '0 0 6px 0',
              letterSpacing: '-0.3px',
            }}
          >
            Acceso a Mostrador
          </h1>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-ink-muted)',
              margin: 0,
            }}
          >
            Iniciá sesión para operar tu kiosco
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--color-tomato-soft, #fee2e2)',
              color: 'var(--color-tomato-solid, #991b1b)',
              border: '1px solid var(--color-tomato-border, #f87171)',
              borderRadius: 'var(--radius-xs)',
              padding: '10px 14px',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="login-email"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '6px',
              }}
            >
              Correo Electrónico
            </label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="username"
              required
              disabled={isSubmitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@negocio.com"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 'var(--text-base)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="login-password"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '6px',
              }}
            >
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 'var(--text-base)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password}
            style={{
              width: '100%',
              padding: '14px 18px',
              backgroundColor: isSubmitting ? 'var(--color-border)' : 'var(--color-pulse-solid)',
              color: '#0f172a',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-base)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            {isSubmitting ? 'VERIFICANDO...' : 'INGRESAR AL MOSTRADOR'}
          </button>
        </form>

        {/* Footer switch to Register */}
        <div
          style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: 'var(--text-sm)',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '16px',
          }}
        >
          <span style={{ color: 'var(--color-ink-muted)', marginRight: '6px' }}>
            ¿Primera vez usando Pulso?
          </span>
          <button
            type="button"
            onClick={onGoToRegister}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--color-ink)',
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
            }}
          >
            Registrar mi negocio
          </button>
        </div>
      </div>
    </main>
  );
};
