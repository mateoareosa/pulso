import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SalesScreen } from '../src/features/sales/components/SalesScreen';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { useCatalogStore, CatalogProductItem } from '../src/features/catalog/store/catalog.store';
import { useCashStore } from '../src/features/cash/store/cash.store';
import { AuthContext } from '../src/features/auth/AuthContext';
import { salesApi } from '../src/features/sales/services/sales-api';

const DEMO_PRODUCTS: CatalogProductItem[] = [
  {
    id: 'prod-01',
    name: 'Alfajor Triple Dulce de Leche',
    category: 'GOLOSINAS',
    barcode: '779001',
    salePriceCents: 120000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 1,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-02',
    name: 'Gaseosa Cola 500ml',
    category: 'BEBIDAS',
    barcode: '779002',
    salePriceCents: 150000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 2,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-03',
    name: 'Agua Mineral 500ml',
    category: 'BEBIDAS',
    barcode: '779003',
    salePriceCents: 100000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 3,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-04',
    name: 'Turrón de Maní',
    category: 'GOLOSINAS',
    barcode: '779004',
    salePriceCents: 45000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 4,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-05',
    name: 'Chicles Menta Fuerte',
    category: 'GOLOSINAS',
    barcode: '779005',
    salePriceCents: 60000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 5,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-06',
    name: 'Caramelos Ácidos x10',
    category: 'GOLOSINAS',
    barcode: '779006',
    salePriceCents: 80000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 6,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-07',
    name: 'Galletitas Rellenas Vainilla',
    category: 'SNACKS',
    barcode: '779007',
    salePriceCents: 180000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 7,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
  {
    id: 'prod-08',
    name: 'Barra de Cereal Frutilla',
    category: 'SNACKS',
    barcode: '779008',
    salePriceCents: 90000,
    stockQuantity: '50.0000',
    minimumStock: '10.0000',
    quickSlot: 8,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
];

const defaultMockSession = {
  sessionId: 's-1',
  userId: 'u-1',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  membershipId: 'm-1',
  role: 'CASHIER' as const,
  user: { id: 'u-1', email: 'c@p.dev', name: 'Cajero' },
  tenant: { id: 'tenant-1', name: 'T', slug: 't' },
  location: { id: 'loc-1', name: 'L' },
  expiresAt: '',
};

const defaultMockAuthContext = {
  status: 'AUTHENTICATED' as const,
  session: defaultMockSession,
  errorMessage: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  retryBootstrap: vi.fn(),
};

describe('SalesScreen Operational Flow', () => {
  beforeEach(() => {
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();
    useSalesStore.getState().setConnectionStatus('online');

    useCatalogStore.setState({
      products: DEMO_PRODUCTS,
      quickProducts: DEMO_PRODUCTS,
      total: DEMO_PRODUCTS.length,
      isLoading: false,
      error: null,
      loadPosCatalog: vi.fn().mockResolvedValue(undefined),
    });

    useCashStore.setState({
      activeShift: {
        id: 'shift-mock-1',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        openedByUserId: 'u-1',
        status: 'OPEN',
        openingAmountCents: 1000000,
        expectedAmountCents: 1000000,
        countedAmountCents: null,
        differenceAmountCents: null,
        openedAtUtc: new Date().toISOString(),
        closedAtUtc: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: {
          openingAmountCents: 1000000,
          cashSalesAmountCents: 0,
          cashInAmountCents: 0,
          cashOutAmountCents: 0,
          refundAmountCents: 0,
          expectedAmountCents: 1000000,
          movementsCount: 1,
          salesCount: 0,
        },
      },
      isLoadingActive: false,
      error: null,
      loadActiveShift: vi.fn().mockResolvedValue(undefined),
    });
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

  it('blocks cash tender and shows warning without clearing cart when no shift is open (button click)', () => {
    useCashStore.setState({ activeShift: null });
    render(<SalesScreen />);

    // Add product
    const productButton = screen.getByText('Gaseosa Cola 500ml');
    fireEvent.click(productButton);
    expect(useSalesStore.getState().items.length).toBe(1);

    // Click Cobrar
    const cobrarBtn = screen.getByText(/COBRAR EN EFECTIVO/i);
    fireEvent.click(cobrarBtn);

    // Must NOT open modal
    expect(screen.queryByText('TOTAL A COBRAR')).toBeNull();
    // Must show warning
    expect(useSalesStore.getState().errorMessage).toContain('No hay un turno de caja abierto');
    // Must preserve cart
    expect(useSalesStore.getState().items.length).toBe(1);
  });

  it('blocks cash tender and shows warning without clearing cart when no shift is open (F4 hotkey)', () => {
    useCashStore.setState({ activeShift: null });
    render(<SalesScreen />);

    // Add product
    const productButton = screen.getByText('Gaseosa Cola 500ml');
    fireEvent.click(productButton);
    expect(useSalesStore.getState().items.length).toBe(1);

    // Press F4
    fireEvent.keyDown(window, { key: 'F4' });

    // Must NOT open modal
    expect(screen.queryByText('TOTAL A COBRAR')).toBeNull();
    // Must show warning
    expect(useSalesStore.getState().errorMessage).toContain('No hay un turno de caja abierto');
    // Must preserve cart
    expect(useSalesStore.getState().items.length).toBe(1);
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
      const saleSpy = vi.spyOn(salesApi, 'createSale').mockResolvedValue({
        success: true,
        sale: {
          id: 'sale-mock-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u-1',
          status: 'COMPLETED',
          totalCents: 45000,
          idempotencyKey: '00000000-0000-0000-0000-000000000001',
          items: [],
          tenders: [],
          createdAtUtc: new Date().toISOString(),
          persistedAt: new Date().toISOString(),
        },
        idempotentReplay: false,
        warnings: [],
      });

      render(
        <AuthContext.Provider value={defaultMockAuthContext}>
          <SalesScreen />
        </AuthContext.Provider>
      );

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

      saleSpy.mockRestore();
    });

    it('dismisses success and starts new sale with Escape key', async () => {
      const saleSpy = vi.spyOn(salesApi, 'createSale').mockResolvedValue({
        success: true,
        sale: {
          id: 'sale-mock-2',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u-1',
          status: 'COMPLETED',
          totalCents: 45000,
          idempotencyKey: '00000000-0000-0000-0000-000000000002',
          items: [],
          tenders: [],
          createdAtUtc: new Date().toISOString(),
          persistedAt: new Date().toISOString(),
        },
        idempotentReplay: false,
        warnings: [],
      });

      render(
        <AuthContext.Provider value={defaultMockAuthContext}>
          <SalesScreen />
        </AuthContext.Provider>
      );

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

      saleSpy.mockRestore();
    });
  });

  describe('Vendible Separation & Large Catalog (> 100 products)', () => {
    it('excludes inactive products and branch-unavailable products from quick ribbon and search', () => {
      const mixedProducts: CatalogProductItem[] = [
        {
          id: 'p-active-avail',
          name: 'Alfajor Disponible',
          category: 'GOLOSINAS',
          barcode: '779100',
          salePriceCents: 1000,
          stockQuantity: '10.0000',
          minimumStock: '1.0000',
          quickSlot: 1,
          isActive: true,
          isAvailable: true,
          version: 1,
        },
        {
          id: 'p-inactive',
          name: 'Alfajor Inactivo Global',
          category: 'GOLOSINAS',
          barcode: '779200',
          salePriceCents: 1000,
          stockQuantity: '10.0000',
          minimumStock: '1.0000',
          quickSlot: 2,
          isActive: false,
          isAvailable: true,
          version: 1,
        },
        {
          id: 'p-unavailable-branch',
          name: 'Alfajor No Disponible Sucursal',
          category: 'GOLOSINAS',
          barcode: '779300',
          salePriceCents: 1000,
          stockQuantity: '10.0000',
          minimumStock: '1.0000',
          quickSlot: 3,
          isActive: true,
          isAvailable: false,
          version: 1,
        },
      ];

      useCatalogStore.setState({
        products: mixedProducts,
        quickProducts: mixedProducts,
      });

      render(<SalesScreen />);

      // Only the active and available product is shown in ribbon
      expect(screen.getByText('Alfajor Disponible')).toBeDefined();
      expect(screen.queryByText('Alfajor Inactivo Global')).toBeNull();
      expect(screen.queryByText('Alfajor No Disponible Sucursal')).toBeNull();

      // Typing in search input also does NOT find unavailable or inactive products
      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);
      fireEvent.change(searchInput, { target: { value: 'Inactivo' } });
      expect(screen.queryByText('Alfajor Inactivo Global')).toBeNull();

      fireEvent.change(searchInput, { target: { value: 'No Disponible' } });
      expect(screen.queryByText('Alfajor No Disponible Sucursal')).toBeNull();
    });

    it('searches dynamically for product 101 via searchPosProducts and adds to cart on Enter', async () => {
      const mockSearchPos = vi.fn().mockResolvedValue([
        {
          id: 'prod-101',
          name: 'Producto Especial 101',
          category: 'ESPECIAL',
          barcode: '779101',
          salePriceCents: 99900,
          stockQuantity: '15.0000',
          minimumStock: '2.0000',
          quickSlot: null,
          isActive: true,
          isAvailable: true,
          version: 1,
        },
      ]);

      useCatalogStore.setState({
        products: DEMO_PRODUCTS,
        quickProducts: DEMO_PRODUCTS,
        searchPosProducts: mockSearchPos,
      });

      // Provide auth session context
      const mockSession = {
        sessionId: 's-1',
        userId: 'u-1',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        membershipId: 'm-1',
        role: 'CASHIER' as const,
        user: { id: 'u-1', email: 'c@p.dev', name: 'Cajero' },
        tenant: { id: 'tenant-1', name: 'T', slug: 't' },
        location: { id: 'loc-1', name: 'L' },
        expiresAt: '',
      };

      render(
        <AuthContext.Provider
          value={{
            status: 'AUTHENTICATED',
            session: mockSession,
            errorMessage: null,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            retryBootstrap: vi.fn(),
          }}
        >
          <SalesScreen />
        </AuthContext.Provider>
      );

      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);
      fireEvent.change(searchInput, { target: { value: '779101' } });

      // Press Enter directly to trigger instant lookup
      await act(async () => {
        fireEvent.keyDown(searchInput, { key: 'Enter' });
      });

      // Should add product-101 to the sales cart
      await waitFor(() => {
        expect(useSalesStore.getState().items[0]?.name).toBe('Producto Especial 101');
        expect(useSalesStore.getState().items[0]?.unitPriceCents).toBe(99900);
      });
    });

    it('invalidates previous remote search matches immediately upon changing input and never adds stale query result on Enter', async () => {
      let resolveAguaPromise: ((val: CatalogProductItem[]) => void) | null = null;
      let resolveAlfajorPromise: ((val: CatalogProductItem[]) => void) | null = null;

      const mockSearch = vi.fn().mockImplementation((_t, _l, query: string) => {
        if (query === 'Agua') {
          return new Promise((resolve) => {
            resolveAguaPromise = resolve;
          });
        }
        if (query === 'Alfajor') {
          return new Promise((resolve) => {
            resolveAlfajorPromise = resolve;
          });
        }
        return Promise.resolve([]);
      });

      const mockSession = {
        sessionId: 's-1',
        userId: 'u-1',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        membershipId: 'm-1',
        role: 'CASHIER' as const,
        user: { id: 'u-1', email: 'c@p.dev', name: 'Cajero' },
        tenant: { id: 'tenant-1', name: 'T', slug: 't' },
        location: { id: 'loc-1', name: 'L' },
        expiresAt: '',
      };

      useCatalogStore.setState({
        products: [],
        quickProducts: [],
        error: null,
        loadPosCatalog: vi.fn().mockResolvedValue(undefined),
        searchPosProducts: mockSearch,
      });

      render(
        <AuthContext.Provider
          value={{
            status: 'AUTHENTICATED',
            session: mockSession,
            errorMessage: null,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            retryBootstrap: vi.fn(),
          }}
        >
          <SalesScreen />
        </AuthContext.Provider>
      );

      const searchInput = screen.getByPlaceholderText(/Escanear código o buscar producto/i);

      // 1. Search "Agua" and wait for debounce to trigger
      fireEvent.change(searchInput, { target: { value: 'Agua' } });

      // Wait for debounce to trigger search
      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledWith('tenant-1', 'loc-1', 'Agua', false);
      });

      // Resolve "Agua" with water product
      await act(async () => {
        resolveAguaPromise?.([
          {
            id: 'prod-agua',
            name: 'Agua Mineral 500ml',
            category: 'Bebidas',
            barcode: '779003',
            salePriceCents: 10000,
            stockQuantity: '10.0000',
            minimumStock: '0.0000',
            isActive: true,
            isAvailable: true,
            version: 1,
          },
        ]);
      });

      // Assert Agua is displayed in results
      await waitFor(() => {
        expect(screen.getByText('Agua Mineral 500ml')).toBeDefined();
      });

      // 2. Rapidly change to "Alfajor"
      fireEvent.change(searchInput, { target: { value: 'Alfajor' } });

      // Immediate invalidation: "Agua Mineral 500ml" must be gone immediately!
      expect(screen.queryByText('Agua Mineral 500ml')).toBeNull();

      // 3. Press Enter BEFORE debounce finishes
      await act(async () => {
        fireEvent.keyDown(searchInput, { key: 'Enter' });
      });

      // 4. Resolve "Alfajor" query
      await act(async () => {
        resolveAlfajorPromise?.([
          {
            id: 'prod-alfajor',
            name: 'Alfajor de Chocolate',
            category: 'Golosinas',
            barcode: '779001',
            salePriceCents: 15000,
            stockQuantity: '20.0000',
            minimumStock: '0.0000',
            isActive: true,
            isAvailable: true,
            version: 1,
          },
        ]);
      });

      // 5. Verify Agua is NEVER added; Alfajor is added!
      const items = useSalesStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe('Alfajor de Chocolate');
      expect(items.find((it) => it.name === 'Agua Mineral 500ml')).toBeUndefined();
    });

    it('initializes POS via loadPosCatalog ignoring administrative statusFilter=INACTIVE and preserving admin state', async () => {
      const mockLoadPos = vi.fn().mockResolvedValue(undefined);

      const mockSession = {
        sessionId: 's-1',
        userId: 'u-1',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        membershipId: 'm-1',
        role: 'CASHIER' as const,
        user: { id: 'u-1', email: 'c@p.dev', name: 'Cajero' },
        tenant: { id: 'tenant-1', name: 'T', slug: 't' },
        location: { id: 'loc-1', name: 'L' },
        expiresAt: '',
      };

      // Simulate administrative state where statusFilter was set to INACTIVE and page was 3
      useCatalogStore.setState({
        statusFilter: 'INACTIVE',
        page: 3,
        searchQuery: 'admin-search',
        selectedCategory: 'cat-admin',
        loadPosCatalog: mockLoadPos,
        quickProducts: DEMO_PRODUCTS.slice(0, 8),
      });

      render(
        <AuthContext.Provider
          value={{
            status: 'AUTHENTICATED',
            session: mockSession,
            errorMessage: null,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            retryBootstrap: vi.fn(),
          }}
        >
          <SalesScreen />
        </AuthContext.Provider>
      );

      // Verify loadPosCatalog was invoked with tenant and location
      expect(mockLoadPos).toHaveBeenCalledWith('tenant-1', 'loc-1', false);

      // Verify administrative state was NOT corrupted or reset by POS initialization
      expect(useCatalogStore.getState().statusFilter).toBe('INACTIVE');
      expect(useCatalogStore.getState().page).toBe(3);
      expect(useCatalogStore.getState().searchQuery).toBe('admin-search');

      // Verify quick ribbon is intact and shows vendible items
      expect(screen.getByText('Alfajor Triple Dulce de Leche')).toBeDefined();
    });

    it('quick slots 1-8 are accessible via keyboard shortcuts [1]-[8] even when products are outside page 1 (> 100 products)', async () => {
      const mockSession = {
        sessionId: 's-1',
        userId: 'u-1',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        membershipId: 'm-1',
        role: 'CASHIER' as const,
        user: { id: 'u-1', email: 'c@p.dev', name: 'Cajero' },
        tenant: { id: 'tenant-1', name: 'T', slug: 't' },
        location: { id: 'loc-1', name: 'L' },
        expiresAt: '',
      };

      // Create quick products representing items outside page 1
      const outsidePageQuickProducts: CatalogProductItem[] = Array.from({ length: 8 }, (_, i) => ({
        id: `prod-outside-qs-${i + 1}`,
        name: `Zebra Quick Product Slot ${i + 1}`,
        category: 'Golosinas',
        barcode: `779999000${i + 1}`,
        salePriceCents: (i + 1) * 1000,
        stockQuantity: '10.0000',
        minimumStock: '0.0000',
        quickSlot: i + 1,
        isActive: true,
        isAvailable: true,
        version: 1,
      }));

      useCatalogStore.setState({
        products: [], // Empty or different page
        quickProducts: outsidePageQuickProducts,
        loadPosCatalog: vi.fn().mockResolvedValue(undefined),
      });

      render(
        <AuthContext.Provider
          value={{
            status: 'AUTHENTICATED',
            session: mockSession,
            errorMessage: null,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            retryBootstrap: vi.fn(),
          }}
        >
          <SalesScreen />
        </AuthContext.Provider>
      );

      // Verify all 8 slots are visible in the ribbon
      for (let slot = 1; slot <= 8; slot++) {
        expect(screen.getByText(`Zebra Quick Product Slot ${slot}`)).toBeDefined();
      }

      // Press shortcut [1]
      fireEvent.keyDown(window, { key: '1' });
      expect(useSalesStore.getState().items[0]?.name).toBe('Zebra Quick Product Slot 1');

      // Press shortcut [8]
      fireEvent.keyDown(window, { key: '8' });
      expect(useSalesStore.getState().items[1]?.name).toBe('Zebra Quick Product Slot 8');
    });
  });
});
