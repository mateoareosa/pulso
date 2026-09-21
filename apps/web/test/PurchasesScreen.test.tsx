import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { PurchasesScreen } from '../src/features/purchases/components/PurchasesScreen';
import { usePurchasesStore } from '../src/features/purchases/store/purchases.store';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { useCashStore } from '../src/features/cash/store/cash.store';
import { AuthContext } from '../src/features/auth/AuthContext';
import { purchasesApi } from '../src/features/purchases/services/purchases-api';
import type { SupplierResponse, PurchaseResponse, PurchaseDetailResponse } from '@pulso/contracts';

vi.mock('../src/features/purchases/services/purchases-api', () => ({
  purchasesApi: {
    fetchSuppliers: vi.fn(),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    toggleSupplierStatus: vi.fn(),
    fetchPurchases: vi.fn(),
    fetchPurchaseById: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    receivePurchase: vi.fn(),
    cancelPurchase: vi.fn(),
  },
}));

const mockSupplier: SupplierResponse = {
  id: 'sup-1',
  tenantId: 'tenant-1',
  name: 'Distribuidora Central SRL',
  normalizedName: 'distribuidora central srl',
  taxId: '30-71234567-9',
  phone: '1145678900',
  email: 'ventas@distribuidora.com',
  address: 'Av. Corrientes 1234',
  notes: 'Entrega los martes',
  isActive: true,
  createdAt: '2026-09-06T10:00:00.000Z',
  updatedAt: '2026-09-06T10:00:00.000Z',
};

const mockPurchase: PurchaseResponse = {
  id: 'pur-1',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  supplierId: 'sup-1',
  supplier: {
    id: 'sup-1',
    name: 'Distribuidora Central SRL',
    taxId: '30-71234567-9',
  },
  status: 'DRAFT',
  documentNumber: 'FAC-0001-00001234',
  purchasedAtUtc: '2026-09-06T10:30:00.000Z',
  receivedAtUtc: null,
  createdByUserId: 'u-1',
  subtotalCents: 10000,
  discountCents: 0,
  additionalCostCents: 0,
  totalCents: 10000,
  paymentSource: 'OUTSIDE_CASH',
  cashShiftId: null,
  cashMovementId: null,
  notes: 'Reposición golosinas',
  itemsCount: 1,
  version: 1,
  createdAt: '2026-09-06T10:30:00.000Z',
  updatedAt: '2026-09-06T10:30:00.000Z',
};

const mockPurchaseDetail: PurchaseDetailResponse = {
  ...mockPurchase,
  items: [
    {
      id: 'line-1',
      purchaseId: mockPurchase.id,
      productId: 'prod-1',
      productNameSnapshot: 'Yerba',
      barcodeSnapshot: null,
      quantity: 1,
      unitCostCents: 10000,
      lineTotalCents: 10000,
      createdAt: mockPurchase.createdAt,
    },
  ],
};

const mockSession = {
  user: { id: 'u-1', name: 'Propietario', email: 'owner@pulso.dev' },
  tenant: { id: 'tenant-1', name: 'Kiosco Central', slug: 'kiosco-central' },
  location: { id: 'loc-1', name: 'Casa Central' },
  role: 'OWNER' as const,
  expiresAt: '2026-09-07T12:00:00.000Z',
};

const purchasesScreenWithAuth = (
  role: 'OWNER' | 'MANAGER' | 'CASHIER' = 'OWNER',
  locationId = 'loc-1',
  tenantId = 'tenant-1'
) => (
  <AuthContext.Provider
    value={{
      status: 'AUTHENTICATED',
      session: {
        ...mockSession,
        role,
        tenant: { ...mockSession.tenant, id: tenantId },
        location: { ...mockSession.location, id: locationId },
      },
      errorMessage: null,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      retryBootstrap: vi.fn(),
    }}
  >
    <PurchasesScreen />
  </AuthContext.Provider>
);

const renderWithAuth = (role: 'OWNER' | 'MANAGER' | 'CASHIER' = 'OWNER') =>
  render(purchasesScreenWithAuth(role));

describe('PurchasesScreen Component - Vertical Slice 5 UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePurchasesStore.getState().clearPurchasesSession();
    useSalesStore.setState({ connectionStatus: 'online' });
    useCashStore.setState({ activeShift: null });

    vi.mocked(purchasesApi.fetchSuppliers).mockResolvedValue({
      items: [mockSupplier],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
      items: [mockPurchase],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    vi.mocked(purchasesApi.fetchPurchaseById).mockResolvedValue(mockPurchaseDetail);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders forbidden banner for CASHIER role and blocks subtab navigation', async () => {
    await act(async () => {
      renderWithAuth('CASHIER');
    });

    expect(screen.getByTestId('purchases-forbidden-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('subtab-purchases-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('subtab-purchases-create')).not.toBeInTheDocument();
  });

  it('renders PurchasesScreen for OWNER, loads data and switches subtabs', async () => {
    await act(async () => {
      renderWithAuth('OWNER');
    });

    // Verify subtabs exist
    expect(screen.getByTestId('subtab-purchases-list')).toBeInTheDocument();
    expect(screen.getByTestId('subtab-purchases-create')).toBeInTheDocument();
    expect(screen.getByTestId('subtab-purchases-suppliers')).toBeInTheDocument();

    // Default tab: purchases list
    await waitFor(() => {
      expect(screen.getByTestId('purchase-row-pur-1')).toBeInTheDocument();
    });

    // Switch to suppliers tab
    await act(async () => {
      fireEvent.click(screen.getByTestId('subtab-purchases-suppliers'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('supplier-row-sup-1')).toBeInTheDocument();
    });

    // Switch to new purchase tab
    await act(async () => {
      fireEvent.click(screen.getByTestId('subtab-purchases-create'));
    });

    expect(screen.getByTestId('purchase-editor-supplier-select')).toBeInTheDocument();
    expect(screen.getByTestId('save-draft-btn')).toBeInTheDocument();
  });

  it('allows MANAGER to load the purchases workflow', async () => {
    await act(async () => renderWithAuth('MANAGER'));

    expect(screen.queryByTestId('purchases-forbidden-banner')).not.toBeInTheDocument();
    expect(await screen.findByTestId('purchase-row-pur-1')).toBeInTheDocument();
  });

  it('displays offline warning banner and disables creation/reception actions when offline', async () => {
    useSalesStore.setState({ connectionStatus: 'offline' });

    await act(async () => {
      renderWithAuth('OWNER');
    });

    expect(screen.getByTestId('purchases-offline-banner')).toBeInTheDocument();

    // Register button in list view is disabled
    expect(screen.getByTestId('start-new-purchase-btn')).toBeDisabled();

    // Switch to editor
    await act(async () => {
      fireEvent.click(screen.getByTestId('subtab-purchases-create'));
    });

    expect(screen.getByTestId('save-draft-btn')).toBeDisabled();
    expect(screen.getByTestId('receive-purchase-btn')).toBeDisabled();
    fireEvent.click(screen.getByTestId('save-draft-btn'));
    fireEvent.click(screen.getByTestId('receive-purchase-btn'));
    expect(purchasesApi.createDraft).not.toHaveBeenCalled();
    expect(purchasesApi.updateDraft).not.toHaveBeenCalled();
    expect(purchasesApi.receivePurchase).not.toHaveBeenCalled();
  });

  it('closes a resumed editor when the authenticated location changes', async () => {
    const { rerender } = renderWithAuth('OWNER');
    fireEvent.click(await screen.findByTestId('view-purchase-pur-1'));
    fireEvent.click(await screen.findByTestId('resume-purchase-btn'));
    expect(screen.getByText('REANUDAR COMPRA')).toBeInTheDocument();

    rerender(purchasesScreenWithAuth('OWNER', 'loc-2'));

    await waitFor(() => expect(screen.queryByText('REANUDAR COMPRA')).not.toBeInTheDocument());
    expect(screen.getByTestId('subtab-purchases-list')).toHaveAttribute('aria-selected', 'true');
  });

  it('clears synchronously, starts no CASHIER loaders, and rejects late OWNER data on a role cycle', async () => {
    let resolveOldPurchases!: (value: {
      items: PurchaseResponse[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }) => void;
    let resolveOldSuppliers!: (value: {
      items: SupplierResponse[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }) => void;
    vi.mocked(purchasesApi.fetchPurchases)
      .mockReturnValueOnce(new Promise((resolve) => (resolveOldPurchases = resolve)))
      .mockRejectedValueOnce(new Error('Reload failed'));
    vi.mocked(purchasesApi.fetchSuppliers)
      .mockReturnValueOnce(new Promise((resolve) => (resolveOldSuppliers = resolve)))
      .mockRejectedValueOnce(new Error('Supplier reload failed'));

    const { rerender } = renderWithAuth('OWNER');
    await waitFor(() => expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(1));

    rerender(purchasesScreenWithAuth('CASHIER'));
    expect(screen.getByTestId('purchases-forbidden-banner')).toBeInTheDocument();
    expect(usePurchasesStore.getState().purchases).toEqual([]);
    expect(usePurchasesStore.getState().suppliers).toEqual([]);
    expect(usePurchasesStore.getState().selectedPurchase).toBeNull();
    expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(1);
    expect(purchasesApi.fetchSuppliers).toHaveBeenCalledTimes(1);

    rerender(purchasesScreenWithAuth('OWNER'));
    await waitFor(() => expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Reload failed'));
    resolveOldPurchases({ items: [mockPurchase], total: 1, page: 1, limit: 20, totalPages: 1 });
    resolveOldSuppliers({ items: [mockSupplier], total: 1, page: 1, limit: 20, totalPages: 1 });

    await waitFor(() => expect(usePurchasesStore.getState().purchases).toEqual([]));
    expect(screen.queryByTestId('purchase-row-pur-1')).not.toBeInTheDocument();
    expect(usePurchasesStore.getState().suppliers).toEqual([]);
  });

  it('opens and displays supplier creation modal', async () => {
    await act(async () => {
      renderWithAuth('OWNER');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('subtab-purchases-suppliers'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('create-supplier-button')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('create-supplier-button'));
    });

    expect(screen.getByTestId('supplier-modal')).toBeInTheDocument();
    expect(screen.getByTestId('supplier-form-name')).toBeInTheDocument();
  });
});
