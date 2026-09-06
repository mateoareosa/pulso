import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SalesHistoryScreen } from '../src/features/sales/components/SalesHistoryScreen';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { AuthContext } from '../src/features/auth/AuthContext';
import { salesApi } from '../src/features/sales/services/sales-api';
import { offlineDb } from '../src/features/sync/offline-db';
import 'fake-indexeddb/auto';

describe('SalesHistoryScreen', () => {
  const mockSession = {
    user: { id: 'u1', name: 'Alice Cashier', email: 'alice@test.com' },
    tenant: { id: 'tenant-1', name: 'Kiosco Central', slug: 'kiosco-central' },
    location: { id: 'loc-1', name: 'Sucursal 1', address: 'Calle 1' },
    role: 'CASHIER' as const,
    expiresAt: new Date().toISOString(),
  };

  const mockAuthContext = {
    status: 'AUTHENTICATED' as const,
    session: mockSession,
    errorMessage: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    retryBootstrap: vi.fn(),
  };

  const mockSales = [
    {
      id: 'sale-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      userId: 'u1',
      idempotencyKey: 'idem-1',
      totalCents: 150000,
      status: 'COMPLETED',
      createdAtUtc: '2026-09-05T14:30:00.000Z',
      persistedAt: '2026-09-05T14:30:01.000Z',
      user: { id: 'u1', name: 'Alice Cashier', email: 'alice@test.com' },
      items: [
        {
          id: 'item-1',
          saleId: 'sale-1',
          productId: 'prod-1',
          name: 'Alfajor Triple',
          barcode: '779001',
          quantity: '1',
          unitPriceCents: 150000,
          totalPriceCents: 150000,
        },
      ],
      tenders: [
        {
          id: 't-1',
          saleId: 'sale-1',
          type: 'CASH' as const,
          amountCents: 150000,
          receivedAmountCents: 200000,
          changeAmountCents: 50000,
        },
      ],
    },
  ];

  beforeEach(async () => {
    vi.restoreAllMocks();
    await offlineDb.clearAll();
    useSalesStore.setState({
      salesHistory: [],
      localSalesHistory: [],
      salesTotal: 0,
      salesPage: 1,
      salesLimit: 20,
      salesTotalPages: 1,
      isSalesHistoryLoading: false,
      salesHistoryError: null,
      selectedSaleDetail: null,
      isDetailLoading: false,
    });
  });

  it('renders sales history list and summary correctly', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: mockSales,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/HISTORIAL DE VENTAS/i)).toBeDefined();
    });

    expect(await screen.findByText('sale-1')).toBeDefined();
    expect(screen.getByText('COMPLETADA')).toBeDefined();
    expect(screen.getByText('$ 1.500,00')).toBeDefined();
  });

  it('opens and closes sale detail modal displaying line items and tenders', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: mockSales,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );

    const detailBtn = await screen.findByRole('button', { name: /detalle/i });
    fireEvent.click(detailBtn);

    // Modal is open
    expect(await screen.findByText(/DETALLE DE VENTA/i)).toBeDefined();
    expect(screen.getByText('Alfajor Triple')).toBeDefined();
    expect(screen.getByText('779001')).toBeDefined();
    expect(screen.getAllByText(/EFECTIVO/i).length).toBeGreaterThanOrEqual(1);

    // Close button closes modal
    const closeBtn = screen.getByRole('button', { name: 'Cerrar detalle' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/DETALLE DE VENTA/i)).toBeNull();
    });
  });

  it('renders PENDIENTE LOCAL and FALLIDA LOCAL with lastError and executes retry on REINTENTAR click', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'idem-pend',
        items: [
          {
            productId: 'p1',
            name: 'Item 1',
            quantity: 1,
            unitPriceCents: 50000,
            totalPriceCents: 50000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 50000 }],
        totalCents: 50000,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );
    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'idem-fail',
        items: [
          {
            productId: 'p2',
            name: 'Item 2',
            quantity: 1,
            unitPriceCents: 75000,
            totalPriceCents: 75000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 75000 }],
        totalCents: 75000,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );
    await offlineDb.updateSyncStatus(
      { tenantId: 'tenant-1', locationId: 'loc-1' },
      'idem-fail',
      'FAILED',
      'Stock insuficiente al sincronizar'
    );

    const retrySpy = vi.fn().mockResolvedValue(undefined);
    useSalesStore.setState({ retryOfflineSale: retrySpy });

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );

    expect(await screen.findByText('PENDIENTE LOCAL')).toBeDefined();
    expect(screen.getByText('FALLIDA LOCAL')).toBeDefined();
    expect(screen.getByText('Stock insuficiente al sincronizar')).toBeDefined();

    const retryBtn = screen.getByRole('button', { name: /Reintentar sincronización de venta/i });
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn);

    expect(retrySpy).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', locationId: 'loc-1' },
      'idem-fail'
    );
  });

  it('displays error details and allows retry from inside the sale detail modal for FAILED sale', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'idem-fail-modal',
        items: [
          {
            productId: 'p-modal',
            name: 'Producto Modal Fallido',
            quantity: 1,
            unitPriceCents: 12000,
            totalPriceCents: 12000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 12000 }],
        totalCents: 12000,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );
    await offlineDb.updateSyncStatus(
      { tenantId: 'tenant-1', locationId: 'loc-1' },
      'idem-fail-modal',
      'FAILED',
      'El producto no pertenece al tenant activo'
    );

    const retrySpy = vi.fn().mockResolvedValue(undefined);
    useSalesStore.setState({ retryOfflineSale: retrySpy });

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );

    expect(await screen.findByText('FALLIDA LOCAL')).toBeDefined();

    const detailBtn = screen.getByRole('button', { name: /Ver detalle de venta/i });
    fireEvent.click(detailBtn);

    // Modal is open
    expect(await screen.findByText(/DETALLE DE VENTA/i)).toBeDefined();
    expect(screen.getByText('OPERACIÓN LOCAL FALLIDA')).toBeDefined();
    expect(screen.getByText(/Causa del rechazo:/i)).toBeDefined();
    expect(
      screen.getAllByText(/El producto no pertenece al tenant activo/i).length
    ).toBeGreaterThanOrEqual(2);

    const modalRetryBtn = screen.getByRole('button', {
      name: /Reintentar sincronización de comprobante/i,
    });
    expect(modalRetryBtn).toBeDefined();
    fireEvent.click(modalRetryBtn);

    expect(retrySpy).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', locationId: 'loc-1' },
      'idem-fail-modal'
    );

    // Modal closes after retry
    await waitFor(() => {
      expect(screen.queryByText(/DETALLE DE VENTA/i)).toBeNull();
    });
  });
});
