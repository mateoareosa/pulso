import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { ApiError } from '../../services/api-client';

interface RegisterScreenProps {
  onGoToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onGoToLogin }) => {
  const { register } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [locationName, setLocationName] = useState('Casa Central');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);

    if (password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }

    if (password !== passwordConfirm) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        businessName,
        locationName,
        ownerName,
        email,
        password,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('El correo electrónico ya se encuentra registrado. Inicie sesión.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Error al registrar el negocio. Verifique su conexión.');
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
          maxWidth: '460px',
          backgroundColor: 'var(--color-surface-raised)',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '32px 28px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Brand Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
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
              marginBottom: '10px',
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
            Registrar Negocio
          </h1>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-ink-muted)',
              margin: 0,
            }}
          >
            Creá tu negocio y comenzá a operar el mostrador
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
              marginBottom: '18px',
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
          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="register-businessName"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '4px',
              }}
            >
              Nombre del Negocio
            </label>
            <input
              id="register-businessName"
              type="text"
              name="businessName"
              required
              disabled={isSubmitting}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ej: Kiosco El Trébol"
              style={{
                width: '100%',
                padding: '10px 12px',
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

          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="register-locationName"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '4px',
              }}
            >
              Nombre de la Primera Sucursal
            </label>
            <input
              id="register-locationName"
              type="text"
              name="locationName"
              required
              disabled={isSubmitting}
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Ej: Casa Central"
              style={{
                width: '100%',
                padding: '10px 12px',
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

          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="register-ownerName"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '4px',
              }}
            >
              Nombre del Propietario / Responsable
            </label>
            <input
              id="register-ownerName"
              type="text"
              name="ownerName"
              required
              disabled={isSubmitting}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Ej: Operador Mostrador"
              style={{
                width: '100%',
                padding: '10px 12px',
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

          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="register-email"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '4px',
              }}
            >
              Correo Electrónico
            </label>
            <input
              id="register-email"
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
                padding: '10px 12px',
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

          <div style={{ marginBottom: '14px' }}>
            <label
              htmlFor="register-password"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '4px',
              }}
            >
              Contraseña (mínimo 12 caracteres)
            </label>
            <input
              id="register-password"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              disabled={isSubmitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 12 caracteres"
              style={{
                width: '100%',
                padding: '10px 12px',
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

          <div style={{ marginBottom: '22px' }}>
            <label
              htmlFor="register-passwordConfirm"
              style={{
                display: 'block',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '4px',
              }}
            >
              Confirmar Contraseña
            </label>
            <input
              id="register-passwordConfirm"
              type="password"
              name="passwordConfirm"
              autoComplete="new-password"
              required
              disabled={isSubmitting}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Repita la contraseña"
              style={{
                width: '100%',
                padding: '10px 12px',
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
            disabled={
              isSubmitting ||
              !businessName.trim() ||
              !locationName.trim() ||
              !ownerName.trim() ||
              !email.trim() ||
              !password
            }
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
            {isSubmitting ? 'CREANDO NEGOCIO...' : 'REGISTRAR NEGOCIO Y ABRIR MOSTRADOR'}
          </button>
        </form>

        {/* Footer switch to Login */}
        <div
          style={{
            marginTop: '20px',
            textAlign: 'center',
            fontSize: 'var(--text-sm)',
            borderTop: '1px solid var(--color-border)',
            paddingTop: '14px',
          }}
        >
          <span style={{ color: 'var(--color-ink-muted)', marginRight: '6px' }}>
            ¿Ya tenés una cuenta?
          </span>
          <button
            type="button"
            onClick={onGoToLogin}
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
            Iniciar sesión
          </button>
        </div>
      </div>
    </main>
  );
};
