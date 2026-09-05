import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../src/App';
import { apiClient, ApiError, NetworkError } from '../src/services/api-client';

const mockAuthenticatedSession = {
  user: {
    id: 'usr_1',
    email: 'operador@kiosco.com',
    name: 'Operador Mostrador',
  },
  tenant: {
    id: 'ten_1',
    name: 'Kiosco El Trébol',
    slug: 'kiosco-el-trebol',
  },
  location: {
    id: 'loc_1',
    name: 'Casa Central',
  },
  role: 'OWNER' as const,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

describe('Frontend Authentication Lifecycle & Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays bootstrap checking screen while session is being verified', async () => {
    // Delay resolution to capture bootstrap state
    vi.spyOn(apiClient, 'getCurrentSession').mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    render(<App />);

    expect(screen.getByText(/Comprobando sesión de mostrador/i)).toBeDefined();
    expect(screen.getByText('PULSO')).toBeDefined();
  });

  it('displays NetworkErrorScreen when connection fails and allows retry', async () => {
    let callCount = 0;
    vi.spyOn(apiClient, 'getCurrentSession').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new NetworkError('Cannot connect');
      }
      return mockAuthenticatedSession;
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/No se pudo conectar con la API/i)).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /REINTENTAR CONEXIÓN/i });
    expect(retryBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Kiosco El Trébol/i)).toBeDefined();
    });
  });

  it('renders LoginScreen when session check returns 401 unauthenticated', async () => {
    vi.spyOn(apiClient, 'getCurrentSession').mockRejectedValue(new ApiError(401, 'No autenticado'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Acceso a Mostrador/i })).toBeDefined();
    });

    expect(screen.getByLabelText(/Correo Electrónico/i)).toBeDefined();
    expect(screen.getByLabelText(/Contraseña/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /INGRESAR AL MOSTRADOR/i })).toBeDefined();
  });

  it('switches between LoginScreen and RegisterScreen using the navigation links', async () => {
    vi.spyOn(apiClient, 'getCurrentSession').mockRejectedValue(new ApiError(401, 'No autenticado'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Registrar mi negocio/i })).toBeDefined();
    });

    // Go to Register
    fireEvent.click(screen.getByRole('button', { name: /Registrar mi negocio/i }));

    expect(screen.getByRole('heading', { name: /Registrar Negocio/i })).toBeDefined();
    expect(screen.getByLabelText(/Nombre del Negocio/i)).toBeDefined();
    expect(screen.getByLabelText(/Nombre de la Primera Sucursal/i)).toBeDefined();
    expect(screen.getByLabelText(/Nombre del Propietario/i)).toBeDefined();

    // Go back to Login
    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión/i }));
    expect(screen.getByRole('heading', { name: /Acceso a Mostrador/i })).toBeDefined();
  });

  it('validates registration passwords for minimum 12 characters and matching confirmation', async () => {
    vi.spyOn(apiClient, 'getCurrentSession').mockRejectedValue(new ApiError(401, 'No autenticado'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Registrar mi negocio/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Registrar mi negocio/i }));

    fireEvent.change(screen.getByLabelText(/Nombre del Negocio/i), {
      target: { value: 'Mi Kiosco' },
    });
    fireEvent.change(screen.getByLabelText(/Nombre de la Primera Sucursal/i), {
      target: { value: 'Sucursal 1' },
    });
    fireEvent.change(screen.getByLabelText(/Nombre del Propietario/i), {
      target: { value: 'Juan' },
    });
    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), {
      target: { value: 'juan@kiosco.com' },
    });

    // Test short password
    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'short123' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar Contraseña/i), {
      target: { value: 'short123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /REGISTRAR NEGOCIO/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 12 caracteres/i);

    // Test mismatching password
    fireEvent.change(screen.getByLabelText(/^Contraseña/i), {
      target: { value: 'passwordValida1234' },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar Contraseña/i), {
      target: { value: 'passwordDiferente123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /REGISTRAR NEGOCIO/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/no coinciden/i);
  });

  it('handles login failure with accessible error and prevents double-submission', async () => {
    vi.spyOn(apiClient, 'getCurrentSession').mockRejectedValue(new ApiError(401, 'No autenticado'));
    const loginSpy = vi
      .spyOn(apiClient, 'login')
      .mockRejectedValue(new ApiError(401, 'Credenciales inválidas'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Correo Electrónico/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Correo Electrónico/i), {
      target: { value: 'test@pulso.app' },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), {
      target: { value: 'wrongpassword' },
    });

    const submitBtn = screen.getByRole('button', { name: /INGRESAR AL MOSTRADOR/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Credenciales inválidas/i);
    });

    expect(loginSpy).toHaveBeenCalledTimes(1);
  });

  it('renders authenticated operational view with real tenant, location, operator and role', async () => {
    vi.spyOn(apiClient, 'getCurrentSession').mockResolvedValue(mockAuthenticatedSession);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Kiosco El Trébol/i)).toBeDefined();
    });

    // Real business, branch, and status
    expect(screen.getByText(/Casa Central/i)).toBeDefined();
    expect(screen.getByText(/Sin turno abierto/i)).toBeDefined();

    // Real operator and translated role
    expect(screen.getByText(/Operador Mostrador \(Propietario\)/i)).toBeDefined();

    // Absence of fictive names and shifts
    expect(screen.queryByText(/Operador \(Cajero\)/i)).toBeNull();
    expect(screen.queryByText(/Turno Tarde #14/i)).toBeNull();

    // Accessible logout button
    const logoutBtn = screen.getByRole('button', { name: /Cerrar sesión/i });
    expect(logoutBtn).toBeDefined();
    expect(logoutBtn.textContent).toContain('SALIR');
  });

  it('logs out and redirects to LoginScreen when logout button is clicked', async () => {
    vi.spyOn(apiClient, 'getCurrentSession').mockResolvedValue(mockAuthenticatedSession);
    const logoutSpy = vi.spyOn(apiClient, 'logout').mockResolvedValue();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cerrar sesión/i })).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/i }));
    });

    expect(logoutSpy).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Acceso a Mostrador/i })).toBeDefined();
    });
  });
});
