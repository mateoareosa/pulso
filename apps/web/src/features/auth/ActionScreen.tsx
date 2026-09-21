import React, { useEffect, useState } from 'react';
import { PasswordSchema, type ActionPreviewResponse } from '@pulso/contracts';
import { apiClient, ApiError } from '../../services/api-client';

export const ActionScreen: React.FC<{ token: string; onDone: () => void }> = ({
  token,
  onDone,
}) => {
  const [preview, setPreview] = useState<ActionPreviewResponse | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void apiClient
      .previewAction(token)
      .then(setPreview)
      .catch(() => setError('Este enlace es inválido o venció.'));
  }, [token]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    const parsedPassword = PasswordSchema.safeParse(password);
    if (!parsedPassword.success) {
      setError(parsedPassword.error.issues[0]?.message ?? 'La contraseña no es válida.');
      return;
    }
    setBusy(true);
    try {
      // An action link may be opened in a browser that still has an owner session.
      // Clear it before consuming the one-time token so completion always lands on
      // a fresh employee login rather than revealing the previous user's shell.
      await apiClient.logout();
      if (preview?.type === 'INVITE') await apiClient.acceptInvitation(token, parsedPassword.data);
      else await apiClient.resetPassword(token, parsedPassword.data);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      data-theme="light"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--color-surface)',
      }}
    >
      <section
        className="pulso-panel"
        style={{
          width: 'min(460px,100%)',
          padding: 28,
          border: '2px solid var(--color-border-bold)',
        }}
      >
        <div
          style={{ color: 'var(--color-accent)', fontWeight: 800, letterSpacing: 2, fontSize: 12 }}
        >
          PULSO / ACCESO
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)' }}>
          {preview?.type === 'PASSWORD_RESET' ? 'Restablecer contraseña' : 'Bienvenido al equipo'}
        </h1>
        {preview && (
          <p>
            Cuenta <strong>{preview.email}</strong> · {preview.tenantName}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {preview && (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <input
              className="pulso-input"
              required
              minLength={12}
              maxLength={128}
              type="password"
              aria-label="Nueva contraseña"
              placeholder="Nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className="pulso-input"
              required
              minLength={12}
              maxLength={128}
              type="password"
              aria-label="Confirmar contraseña"
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button className="pulso-button pulso-button--primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Establecer contraseña'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};
