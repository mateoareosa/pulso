import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../src/App';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { apiClient } from '../src/services/api-client';

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

describe('App Root Component - Clean Production Shell', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();
    vi.spyOn(apiClient, 'getCurrentSession').mockResolvedValue(mockAuthenticatedSession);
  });

  it('renders sales screen directly and does not render ComponentCatalog', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Escanear código o buscar producto/i)).toBeDefined();
    });

    expect(screen.queryByText(/Catálogo de Componentes/i)).toBeNull();
    expect(screen.queryByText(/CATÁLOGO COMPONENTES/i)).toBeNull();
  });

  it('does NOT display static fictive cash in the operational ribbon', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Kiosco El Trébol/i)).toBeDefined();
    });

    // Fictive cash amount must not be displayed
    expect(screen.queryByText(/\$ 45\.200,00/)).toBeNull();
    expect(screen.queryByText(/Caja:/i)).toBeNull();
  });

  it('allows navigating between MOSTRADOR, HISTORIAL and PRODUCTOS tabs', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /HISTORIAL/i })).toBeDefined();
    });

    // Click HISTORIAL
    fireEvent.click(screen.getByRole('tab', { name: /HISTORIAL/i }));
    await waitFor(() => {
      expect(screen.getByText(/HISTORIAL DE VENTAS/i)).toBeDefined();
    });

    // Click PRODUCTOS
    fireEvent.click(screen.getByRole('tab', { name: /PRODUCTOS/i }));
    await waitFor(() => {
      expect(screen.getByText(/Productos e Inventario/i)).toBeDefined();
    });

    // Back to MOSTRADOR
    fireEvent.click(screen.getByRole('tab', { name: /MOSTRADOR/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Escanear código o buscar producto/i)).toBeDefined();
    });
  });

  it('keeps the operational ribbon and shared connection state synchronized with browser offline events', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeTruthy();
    });

    expect(screen.getByRole('banner').classList.contains('pulso-ribbon')).toBe(true);
    const connectionButton = screen.getByRole('button', { name: /Estado de conexión/i });
    expect(connectionButton.textContent).toContain('ONLINE');

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));

    await waitFor(() => expect(connectionButton.textContent).toContain('SIN CONEXIÓN'));
  });

  it.each([
    {
      role: 'CASHIER' as const,
      visible: ['MOSTRADOR', 'CAJA', 'HISTORIAL'],
      hidden: ['EMPLEADOS', 'PRODUCTOS', 'COMPRAS'],
    },
    {
      role: 'MANAGER' as const,
      visible: ['MOSTRADOR', 'CAJA', 'HISTORIAL', 'PRODUCTOS', 'COMPRAS'],
      hidden: ['EMPLEADOS'],
    },
  ])(
    'renders the permitted operational navigation for $role employees',
    async ({ role, visible, hidden }) => {
      vi.mocked(apiClient.getCurrentSession).mockResolvedValue({
        ...mockAuthenticatedSession,
        role,
      });

      render(<App />);

      await waitFor(() => expect(screen.getByRole('tab', { name: 'MOSTRADOR' })).toBeDefined());

      for (const label of visible) {
        expect(screen.getByRole('tab', { name: label })).toBeDefined();
      }
      for (const label of hidden) {
        expect(screen.queryByRole('tab', { name: label })).toBeNull();
      }
    }
  );

  it('does not bootstrap an existing session while an action token is being accepted', async () => {
    window.history.replaceState({}, '', `/accept-invitation#token=${'a'.repeat(43)}`);
    vi.spyOn(apiClient, 'previewAction').mockImplementation(() => new Promise(() => {}));

    render(<App />);

    expect(await screen.findByText('PULSO / ACCESO')).toBeDefined();
    expect(apiClient.getCurrentSession).not.toHaveBeenCalled();
  });
});
