import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SalesHistoryScreen } from '../src/features/sales/components/SalesHistoryScreen';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { AuthContext } from '../src/features/auth/AuthContext';
import { salesApi } from '../src/features/sales/services/sales-api';
import { offlineDb } from '../src/features/sync/offline-db';
import 'fake-indexeddb/auto';
import type { SaleResponse } from '@pulso/contracts';

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

  const mockSales: SaleResponse[] = [
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
    vi.unstubAllEnvs();
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

  it('exposes sales history as an oversight ledger with an accessible detail region', async () => {
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

    const history = await screen.findByRole('region', { name: /historial de ventas/i });
    expect(history).toHaveClass('ticket-ledger-view', 'ticket-ledger-oversight');
    expect(screen.getByTestId('sales-history-table')).toHaveClass('ticket-ledger-table');
    fireEvent.click(screen.getByRole('button', { name: /detalle/i }));
    const receipt = await screen.findByRole('region', { name: /comprobante de venta/i });
    expect(receipt.parentElement).toHaveClass('ticket-ledger-modal');
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

  it('gates adjustment actions by role and submits an accessible partial return', async () => {
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: mockSales,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    const returnSpy = vi.spyOn(salesApi, 'returnSale').mockResolvedValueOnce({
      adjustment: {
        id: 'adj-1',
        type: 'RETURN',
        status: 'COMPLETED',
        reason: 'Producto dañado',
        totalCents: 150000,
        refundTender: 'CASH',
        refundStatus: 'COMPLETED',
        actor: mockSession.user,
        createdAt: new Date().toISOString(),
        items: [],
      },
      sale: mockSales[0]!,
      idempotentReplay: false,
    });
    render(
      <AuthContext.Provider
        value={{ ...mockAuthContext, session: { ...mockSession, role: 'MANAGER' as const } }}
      >
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );
    fireEvent.click(await screen.findByRole('button', { name: /detalle/i }));
    fireEvent.click(await screen.findByRole('button', { name: /devolver artículos/i }));
    expect(screen.getByRole('dialog', { name: /devolver artículos/i })).toBeDefined();
    fireEvent.change(screen.getByRole('spinbutton', { name: /cantidad a devolver/i }), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /motivo del ajuste/i }), {
      target: { value: 'Producto dañado' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar devolución/i }));
    await waitFor(() =>
      expect(returnSpy).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({
          reason: 'Producto dañado',
          items: [{ saleItemId: 'item-1', quantity: 1 }],
        })
      )
    );
    const command = returnSpy.mock.calls[0]?.[1];
    expect(command?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('shows complete adjustment audit details to cashiers while keeping actions hidden', async () => {
    const adjustedSale: SaleResponse = {
      ...mockSales[0]!,
      adjustments: [
        {
          id: 'adj-1',
          type: 'RETURN',
          status: 'PENDING',
          reason: 'Reintegro a tarjeta',
          totalCents: 150000,
          refundTender: 'DEBIT',
          refundStatus: 'PENDING',
          actor: { id: 'manager-1', name: 'María Manager', email: 'manager@test.com' },
          createdAt: '2026-09-19T18:30:00.000Z',
          items: [
            {
              id: 'adj-item-1',
              saleItemId: 'item-1',
              productId: 'prod-1',
              quantity: '1',
              unitPriceCents: 150000,
              totalCents: 150000,
            },
          ],
        },
      ],
    };
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [adjustedSale],
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
    fireEvent.click(await screen.findByRole('button', { name: /detalle/i }));

    expect(screen.getByRole('region', { name: /historial de ajustes/i })).toHaveTextContent(
      'Reintegro a tarjeta'
    );
    expect(screen.getByRole('region', { name: /historial de ajustes/i })).toHaveTextContent(
      'María Manager'
    );
    expect(screen.getByRole('region', { name: /historial de ajustes/i })).toHaveTextContent(
      'Débito'
    );
    expect(screen.getByRole('region', { name: /historial de ajustes/i })).toHaveTextContent(
      'Pendiente manual'
    );
    expect(screen.getByRole('region', { name: /historial de ajustes/i })).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: /devolver artículos/i })).toBeNull();
  });

  it('disables returns when no quantity remains eligible', async () => {
    const fullyReturned: SaleResponse = {
      ...mockSales[0]!,
      adjustments: [
        {
          id: 'adj-full',
          type: 'RETURN',
          status: 'COMPLETED',
          reason: 'Devuelto',
          totalCents: 150000,
          refundTender: 'CASH',
          refundStatus: 'COMPLETED',
          actor: mockSession.user,
          createdAt: '2026-09-19T18:30:00.000Z',
          items: [
            {
              id: 'adj-item-full',
              saleItemId: 'item-1',
              productId: 'prod-1',
              quantity: '1',
              unitPriceCents: 150000,
              totalCents: 150000,
            },
          ],
        },
      ],
    };
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [fullyReturned],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    render(
      <AuthContext.Provider
        value={{ ...mockAuthContext, session: { ...mockSession, role: 'MANAGER' as const } }}
      >
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );
    fireEvent.click(await screen.findByRole('button', { name: /detalle/i }));
    expect(screen.getByRole('button', { name: /devolver artículos/i })).toBeDisabled();
  });

  it('does not render return/void actions for a cashier', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /detalle/i }));
    expect(screen.queryByRole('button', { name: /devolver artículos/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /anular venta/i })).toBeNull();
  });

  it('hides adjustment actions behind the rollout kill switch', async () => {
    vi.stubEnv('VITE_SALES_ADJUSTMENTS_ENABLED', 'false');
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: mockSales,
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    render(
      <AuthContext.Provider
        value={{ ...mockAuthContext, session: { ...mockSession, role: 'MANAGER' as const } }}
      >
        <SalesHistoryScreen />
      </AuthContext.Provider>
    );
    fireEvent.click(await screen.findByRole('button', { name: /detalle/i }));
    expect(screen.queryByRole('button', { name: /devolver artículos/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /anular venta/i })).toBeNull();
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
