import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProductsScreen } from '../src/features/catalog/components/ProductsScreen';
import { useCatalogStore, CatalogProductItem } from '../src/features/catalog/store/catalog.store';
import { AuthContext } from '../src/features/auth/AuthContext';

const MOCK_PRODUCTS: CatalogProductItem[] = [
  {
    id: 'prod-01',
    name: 'Alfajor Triple Dulce de Leche',
    category: 'GOLOSINAS',
    categoryId: 'cat-1',
    barcode: '779001',
    sku: 'ALF-01',
    salePriceCents: 120000,
    costPriceCents: 75000,
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
    categoryId: 'cat-2',
    barcode: '779002',
    sku: 'BEB-01',
    salePriceCents: 150000,
    costPriceCents: 95000,
    stockQuantity: '5.0000',
    minimumStock: '10.0000', // low stock warning
    quickSlot: 2,
    isActive: true,
    isAvailable: true,
    version: 1,
  },
];

const mockOwnerSession = {
  status: 'AUTHENTICATED' as const,
  session: {
    sessionId: 'sess-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    membershipId: 'mem-1',
    role: 'OWNER' as const,
    user: { id: 'user-1', email: 'owner@pulso.dev', name: 'Dueño Test' },
    tenant: { id: 'tenant-1', name: 'Comercio Test', slug: 'comercio-test' },
    location: { id: 'loc-1', name: 'Casa Central' },
    expiresAt: new Date().toISOString(),
  },
  errorMessage: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  retryBootstrap: vi.fn(),
};

describe('ProductsScreen ("Mostrador vivo" Visual Catalog)', () => {
  beforeEach(() => {
    useCatalogStore.setState({
      products: MOCK_PRODUCTS,
      quickProducts: MOCK_PRODUCTS,
      categories: [
        {
          id: 'cat-1',
          tenantId: 'tenant-1',
          name: 'Golosinas',
          normalizedName: 'golosinas',
          isActive: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'cat-2',
          tenantId: 'tenant-1',
          name: 'Bebidas',
          normalizedName: 'bebidas',
          isActive: true,
          createdAt: '',
          updatedAt: '',
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
      searchQuery: '',
      selectedCategory: null,
      statusFilter: 'ALL',
      isLoading: false,
      error: null,
      loadCatalog: vi.fn().mockResolvedValue(undefined),
      loadCategories: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders products table and quick slots ribbon 1-8', () => {
    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    expect(screen.getByText('Productos e Inventario')).toBeDefined();
    expect(
      screen.getByText('CINTA DE PRODUCTOS RÁPIDOS EN MOSTRADOR (SLOTS 1 AL 8)')
    ).toBeDefined();

    // Table rows
    const table = screen.getByRole('table');
    expect(within(table).getByText('Alfajor Triple Dulce de Leche')).toBeDefined();
    expect(within(table).getByText('Gaseosa Cola 500ml')).toBeDefined();

    // Slots ribbon
    const ribbon = screen.getByRole('region', { name: /Cinta de atajos rápidos 1 a 8/i });
    expect(within(ribbon).getByText('[1]')).toBeDefined();
    expect(within(ribbon).getByText('[2]')).toBeDefined();
    expect(within(ribbon).getByText('Alfajor Triple Dulce de Leche')).toBeDefined();
  });

  it('filters products table by search input', () => {
    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre, código de barras o SKU/i);
    fireEvent.change(searchInput, { target: { value: 'cola' } });

    const table = screen.getByRole('table');
    expect(within(table).getByText('Gaseosa Cola 500ml')).toBeDefined();
    expect(within(table).queryByText('Alfajor Triple Dulce de Leche')).toBeNull();
  });

  it('opens and closes product creation dialog', () => {
    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    const newBtn = screen.getByText('NUEVO PRODUCTO');
    fireEvent.click(newBtn);

    expect(screen.getByText('ALTA DE PRODUCTO')).toBeDefined();
    expect(screen.getByPlaceholderText('Ej: Alfajor Triple Chocolate')).toBeDefined();

    const cancelBtn = screen.getByText('Cancelar');
    fireEvent.click(cancelBtn);

    expect(screen.queryByText('ALTA DE PRODUCTO')).toBeNull();
  });

  it('opens stock adjustment dialog with current stock and projected calculation', () => {
    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    const stockButtons = screen.getAllByTitle('Ajustar stock');
    fireEvent.click(stockButtons[0]!); // Click Stock on Alfajor

    const dialog = screen.getByRole('dialog', { name: /Ajuste Manual de Inventario/i });
    expect(within(dialog).getByText('AJUSTE MANUAL DE INVENTARIO')).toBeDefined();
    expect(within(dialog).getByText('Stock actual:')).toBeDefined();
    expect(within(dialog).getByText('50')).toBeDefined();
  });

  it('displays empty state when catalog has no products', () => {
    useCatalogStore.setState({
      products: [],
      quickProducts: [],
      total: 0,
      isLoading: false,
      error: null,
      loadCatalog: vi.fn().mockResolvedValue(undefined),
      loadCategories: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    expect(screen.getByText('El catálogo está vacío.')).toBeDefined();
    expect(screen.getByText('CREAR PRIMER PRODUCTO')).toBeDefined();
  });

  it('filters products by status (ALL, ACTIVE, INACTIVE)', () => {
    const productsWithMixedStatus: CatalogProductItem[] = [
      {
        ...MOCK_PRODUCTS[0]!,
        id: 'p-act',
        name: 'Producto Activo Test',
        isActive: true,
      },
      {
        ...MOCK_PRODUCTS[1]!,
        id: 'p-inact',
        name: 'Producto Inactivo Test',
        isActive: false,
      },
    ];

    useCatalogStore.setState({
      products: productsWithMixedStatus,
      total: 2,
    });

    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    const table = screen.getByRole('table');
    const statusSelect = screen.getByLabelText(/Estado:/i);

    // Default is ALL
    expect(within(table).getByText('Producto Activo Test')).toBeDefined();
    expect(within(table).getByText('Producto Inactivo Test')).toBeDefined();

    // Select ACTIVE
    fireEvent.change(statusSelect, { target: { value: 'ACTIVE' } });
    expect(within(table).getByText('Producto Activo Test')).toBeDefined();
    expect(within(table).queryByText('Producto Inactivo Test')).toBeNull();

    // Select INACTIVE
    fireEvent.change(statusSelect, { target: { value: 'INACTIVE' } });
    expect(within(table).queryByText('Producto Activo Test')).toBeNull();
    expect(within(table).getByText('Producto Inactivo Test')).toBeDefined();
  });

  it('displays branch availability status with accessible label and allows toggling in edit modal', () => {
    const productsWithAvailability: CatalogProductItem[] = [
      {
        ...MOCK_PRODUCTS[0]!,
        id: 'p-avail',
        name: 'Producto Disponible Central',
        isAvailable: true,
      },
      {
        ...MOCK_PRODUCTS[1]!,
        id: 'p-unavail',
        name: 'Producto No Disponible Central',
        isAvailable: false,
      },
    ];

    useCatalogStore.setState({
      products: productsWithAvailability,
      total: 2,
    });

    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    // Accessible labels present in table
    expect(screen.getByLabelText('Disponibilidad en sucursal: Disponible')).toBeDefined();
    expect(screen.getByLabelText('Disponibilidad en sucursal: No disponible')).toBeDefined();

    // Open edit on unavailable product
    const editButtons = screen.getAllByTitle('Editar producto');
    fireEvent.click(editButtons[1]!);

    // Dialog has distinct availability toggle
    const availBtn = screen.getByLabelText(/Disponibilidad en esta sucursal:/i);
    expect(availBtn).toBeDefined();
    expect(within(availBtn).getByText('NO DISPONIBLE')).toBeDefined();

    // Toggle availability
    fireEvent.click(availBtn);
    expect(within(availBtn).getByText('DISPONIBLE EN SUCURSAL')).toBeDefined();
  });

  it('renders pagination controls and navigates pages', () => {
    useCatalogStore.setState({
      products: MOCK_PRODUCTS,
      total: 105,
      page: 1,
      limit: 50,
      totalPages: 3,
    });

    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Página 1 de 3 \(105 productos totales\)/i)).toBeDefined();
    const prevBtn = screen.getByText('Anterior');
    const nextBtn = screen.getByText('Siguiente');

    expect(prevBtn).toBeDefined();
    expect(nextBtn).toBeDefined();
    expect(prevBtn.getAttribute('disabled')).not.toBeNull();
    expect(nextBtn.getAttribute('disabled')).toBeNull();
  });

  it('handles 409 concurrency conflict during stock adjustment and displays operational error message', async () => {
    const mockAdjustStock = vi
      .fn()
      .mockRejectedValue(new Error('409 Conflict: Expected version mismatch'));

    useCatalogStore.setState({
      products: [
        {
          ...MOCK_PRODUCTS[0]!,
          version: 2,
        },
      ],
      total: 1,
      adjustStock: mockAdjustStock,
    });

    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    const stockBtn = screen.getByTitle('Ajustar stock');
    fireEvent.click(stockBtn);

    const dialog = screen.getByRole('dialog', { name: /Ajuste Manual de Inventario/i });
    const qtyInput = within(dialog).getByPlaceholderText('Ej: 10');
    const reasonInput = within(dialog).getByPlaceholderText(/Llegada de proveedor/i);

    fireEvent.change(qtyInput, { target: { value: '5' } });
    fireEvent.change(reasonInput, { target: { value: 'Recuento concurrente' } });

    const applyBtn = within(dialog).getByText('APLICAR AJUSTE');
    fireEvent.click(applyBtn);

    // Concurrency conflict error displayed
    await screen.findByText(
      /Conflicto de concurrencia: el inventario fue modificado por otra terminal/i
    );
    expect(mockAdjustStock).toHaveBeenCalledWith(
      'tenant-1',
      'loc-1',
      'prod-01',
      expect.objectContaining({
        expectedVersion: 2,
      })
    );
  });

  it('performs accent-insensitive in-memory refiltering so "acidos" matches "Caramelos Ácidos"', () => {
    const productsWithAccents: CatalogProductItem[] = [
      {
        ...MOCK_PRODUCTS[0]!,
        id: 'p-acidos',
        name: 'Caramelos Ácidos Frutales',
      },
      {
        ...MOCK_PRODUCTS[1]!,
        id: 'p-dulce',
        name: 'Alfajor Dulce de Leche',
      },
    ];

    useCatalogStore.setState({
      products: productsWithAccents,
      total: 2,
    });

    render(
      <AuthContext.Provider value={mockOwnerSession}>
        <ProductsScreen />
      </AuthContext.Provider>
    );

    const table = screen.getByRole('table');
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre, código de barras o SKU/i);

    // Initial: both shown
    expect(within(table).getByText('Caramelos Ácidos Frutales')).toBeDefined();
    expect(within(table).getByText('Alfajor Dulce de Leche')).toBeDefined();

    // Type "acidos" without accent
    fireEvent.change(searchInput, { target: { value: 'acidos' } });

    // Must still match "Caramelos Ácidos Frutales"!
    expect(within(table).getByText('Caramelos Ácidos Frutales')).toBeDefined();
    expect(within(table).queryByText('Alfajor Dulce de Leche')).toBeNull();
  });
});
