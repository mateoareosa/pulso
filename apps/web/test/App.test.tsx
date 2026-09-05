import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
