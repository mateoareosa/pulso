import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SalesScreen } from '../src/features/sales/components/SalesScreen';
import { useSalesStore } from '../src/features/sales/store/sales.store';

describe('SalesScreen Operational Flow', () => {
  beforeEach(() => {
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();
    useSalesStore.getState().setConnectionStatus('online');
  });

  it('renders initial empty sales screen with barcode input and empty receipt', () => {
    render(<SalesScreen />);

    expect(screen.getByPlaceholderText(/Escanear código o buscar producto/i)).toBeDefined();
    expect(screen.getByText('Esperando productos...')).toBeDefined();
    expect(screen.getByText('TOTAL')).toBeDefined();
  });

  it('adds product from quick ribbon, updates live receipt and total', () => {
    render(<SalesScreen />);

    // Click "Turrón de Maní" on quick products ribbon
    const productButtons = screen.getAllByText('Turrón de Maní');
    fireEvent.click(productButtons[0]!);

    // Now it appears in the quick ribbon and in the live receipt
    const matchingElements = screen.getAllByText('Turrón de Maní');
    expect(matchingElements.length).toBe(2);

    // Price appears on the ticket and quick strip
    const priceElements = screen.getAllByText(/450,00/);
    expect(priceElements.length).toBeGreaterThanOrEqual(1);
  });

  it('opens cash tender modal on cobrar button click', () => {
    render(<SalesScreen />);

    // Add product
    const productButton = screen.getByText('Gaseosa Cola 500ml');
    fireEvent.click(productButton);

    // Click Cobrar
    const cobrarBtn = screen.getByText(/COBRAR EN EFECTIVO/i);
    fireEvent.click(cobrarBtn);

    expect(screen.getByText('TOTAL A COBRAR')).toBeDefined();
    expect(screen.getByText('Efectivo Recibido')).toBeDefined();
  });
});
