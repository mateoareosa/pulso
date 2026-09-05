import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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

  describe('Dynamic Product Search & Filtering', () => {
    it('visually filters quick products while typing', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      // Initially all 8 quick products are visible
      expect(screen.getByText('Agua Mineral 500ml')).toBeDefined();
      expect(screen.getByText('Alfajor Triple Dulce de Leche')).toBeDefined();

      // Type "agua"
      fireEvent.change(searchInput, { target: { value: 'agua' } });

      // Only "Agua Mineral 500ml" should be displayed in the strip
      expect(screen.getByText('Agua Mineral 500ml')).toBeDefined();
      expect(screen.queryByText('Alfajor Triple Dulce de Leche')).toBeNull();
    });

    it('navigates filtered matches with ArrowDown and ArrowUp and adds on Enter', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      // "500ml" matches "Gaseosa Cola 500ml" and "Agua Mineral 500ml"
      fireEvent.change(searchInput, { target: { value: '500ml' } });

      // First match is selected by default (index 0). Press ArrowDown to select index 1.
      fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

      // Press Enter to confirm adding the selected product
      fireEvent.keyDown(searchInput, { key: 'Enter' });

      // Search query should be cleared
      expect((searchInput as HTMLInputElement).value).toBe('');

      // And store now has the selected product
      expect(useSalesStore.getState().items[0]?.name).toBe('Agua Mineral 500ml');

      // The 8 quick products are restored
      expect(screen.getByText('Alfajor Triple Dulce de Leche')).toBeDefined();
    });

    it('shows accessible "Producto no encontrado" state when search has no matches', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      fireEvent.change(searchInput, { target: { value: 'InexistenteXYZ' } });

      expect(screen.getByRole('status')).toBeDefined();
      expect(screen.getByText(/Producto no encontrado/i)).toBeDefined();

      // Pressing Enter does not add anything to cart
      fireEvent.keyDown(searchInput, { key: 'Enter' });
      expect(useSalesStore.getState().items).toHaveLength(0);
    });

    it('restores all 8 quick products when search input is cleared manually', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      fireEvent.change(searchInput, { target: { value: 'chicles' } });
      expect(screen.queryByText('Turrón de Maní')).toBeNull();

      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByText('Turrón de Maní')).toBeDefined();
      expect(screen.getByText('Alfajor Triple Dulce de Leche')).toBeDefined();
    });
  });

  describe('Shortcuts 1-8 Scope & Non-interference', () => {
    it('uses 1-8 to add products only when search is empty and input is not focused', () => {
      render(<SalesScreen />);

      // Pressing '1' on window when search is empty adds shortcut 1 (Alfajor)
      fireEvent.keyDown(window, { key: '1' });
      expect(useSalesStore.getState().items[0]?.name).toBe('Alfajor Triple Dulce de Leche');
    });

    it('does NOT trigger shortcut addition when typing numbers into search input', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);
      searchInput.focus();

      // Type '779001'
      fireEvent.change(searchInput, { target: { value: '779001' } });
      fireEvent.keyDown(searchInput, { key: '1' });

      // Cart should still be empty (only 1 was typed, not executed as shortcut)
      expect(useSalesStore.getState().items).toHaveLength(0);
    });
  });

  describe('Cash Tender Keyboard Event Ownership & Focus Management', () => {
    it('Escape executes cancellation exactly once and closes modal', () => {
      render(<SalesScreen />);

      fireEvent.click(screen.getByText('Turrón de Maní'));
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      expect(screen.getByRole('dialog', { name: /Cobro en efectivo/i })).toBeDefined();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      // Modal is closed
      expect(screen.queryByRole('dialog')).toBeNull();
      // Item is still in cart
      expect(useSalesStore.getState().items).toHaveLength(1);
    });

    it('F2 does NOT focus the search input behind the modal while tender is open', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      fireEvent.click(screen.getByText('Turrón de Maní'));
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      expect(screen.getByRole('dialog', { name: /Cobro en efectivo/i })).toBeDefined();

      // Ensure searchInput is blurred
      searchInput.blur();
      expect(document.activeElement).not.toBe(searchInput);

      // Press F2 on window
      fireEvent.keyDown(window, { key: 'F2' });

      // Search input must NOT be focused
      expect(document.activeElement).not.toBe(searchInput);
    });

    it('numeric keys do NOT add products to cart while tender modal is open', () => {
      render(<SalesScreen />);

      fireEvent.click(screen.getByText('Turrón de Maní'));
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      expect(screen.getByRole('dialog', { name: /Cobro en efectivo/i })).toBeDefined();

      // Press numeric keys (1 is Alfajor, 2 is Cola)
      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '2' });

      // Cart must still have only 1 item (Turrón de Maní)
      expect(useSalesStore.getState().items).toHaveLength(1);
      expect(useSalesStore.getState().items[0]?.name).toBe('Turrón de Maní');
    });

    it('restores focus to search input when modal is closed', () => {
      render(<SalesScreen />);
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      fireEvent.click(screen.getByText('Turrón de Maní'));
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      expect(screen.getByRole('dialog', { name: /Cobro en efectivo/i })).toBeDefined();

      // Close modal via Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      // Faux-DOM focus check
      expect(document.activeElement).toBe(searchInput);
    });

    it('opening and closing repeatedly does not accumulate listeners', () => {
      render(<SalesScreen />);

      fireEvent.click(screen.getByText('Turrón de Maní'));

      // Open and close 1
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();

      // Open and close 2
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();

      // Open and close 3
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();

      // Modal close restored focus to searchInput. Blur it to test background shortcut 1
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);
      searchInput.blur();

      // Now pressing '1' outside the modal adds Alfajor once cleanly
      fireEvent.keyDown(window, { key: '1' });
      expect(useSalesStore.getState().items).toHaveLength(2);
    });
  });

  describe('Post-sale Success Screen Confirmation', () => {
    it('dismisses success and starts new sale with Enter key', async () => {
      render(<SalesScreen />);

      // Add product and tender
      fireEvent.click(screen.getByText('Turrón de Maní'));
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));

      // Tender exact cash via UI
      fireEvent.click(screen.getByText('EXACTO'));

      await act(async () => {
        fireEvent.click(screen.getByText(/CONFIRMAR COBRO/i));
      });

      await waitFor(() => {
        expect(screen.getByText(/VENTA CONFIRMADA|VENTA GUARDADA LOCAL/i)).toBeDefined();
      });

      // Press Enter to start new sale
      act(() => {
        fireEvent.keyDown(window, { key: 'Enter' });
      });

      // Success screen dismissed
      expect(useSalesStore.getState().lastSaleSuccess).toBeNull();
      expect(screen.queryByText(/VENTA CONFIRMADA/i)).toBeNull();
      expect(screen.getByText('Esperando productos...')).toBeDefined();
    });

    it('dismisses success and starts new sale with Escape key', async () => {
      render(<SalesScreen />);

      fireEvent.click(screen.getByText('Turrón de Maní'));
      fireEvent.click(screen.getByText(/COBRAR EN EFECTIVO/i));

      fireEvent.click(screen.getByText('EXACTO'));

      await act(async () => {
        fireEvent.click(screen.getByText(/CONFIRMAR COBRO/i));
      });

      await waitFor(() => {
        expect(screen.getByText(/VENTA CONFIRMADA|VENTA GUARDADA LOCAL/i)).toBeDefined();
      });

      // Press Escape to dismiss
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(useSalesStore.getState().lastSaleSuccess).toBeNull();
      expect(screen.queryByText(/VENTA CONFIRMADA/i)).toBeNull();
    });
  });
});
