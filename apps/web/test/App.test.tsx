import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';
import { useSalesStore } from '../src/features/sales/store/sales.store';

describe('App Root Component - Clean Production Shell', () => {
  beforeEach(() => {
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();
  });

  it('renders sales screen directly and does not render ComponentCatalog', () => {
    render(<App />);

    // Starts directly in Sales screen
    expect(screen.getByPlaceholderText(/Escanear código o buscar producto/i)).toBeDefined();
    expect(screen.queryByText(/Catálogo de Componentes/i)).toBeNull();
    expect(screen.queryByText(/CATÁLOGO COMPONENTES/i)).toBeNull();
  });

  it('does NOT display static fictive cash in the operational ribbon', () => {
    render(<App />);

    // Fictive cash amount must not be displayed
    expect(screen.queryByText(/\$ 45\.200,00/)).toBeNull();
    expect(screen.queryByText(/Caja:/i)).toBeNull();
  });
});
