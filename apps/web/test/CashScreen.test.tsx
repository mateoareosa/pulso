import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { CashScreen } from '../src/features/cash/components/CashScreen';
import { useCashStore } from '../src/features/cash/store/cash.store';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { AuthContext } from '../src/features/auth/AuthContext';
import { cashApi } from '../src/features/cash/services/cash-api';
import type { CashShiftResponse } from '@pulso/contracts';

vi.mock('../src/features/cash/services/cash-api', () => ({
  cashApi: {
    fetchActiveShift: vi.fn(),
    openShift: vi.fn(),
    registerCashIn: vi.fn(),
    registerCashOut: vi.fn(),
    closeShift: vi.fn(),
    fetchShifts: vi.fn(),
    fetchShiftById: vi.fn(),
  },
}));

const mockShift: CashShiftResponse = {
  id: 'shift-100',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  openedByUserId: 'u-1',
  openedByUser: { id: 'u-1', name: 'Cajero Principal', email: 'cajero@pulso.dev' },
  status: 'OPEN',
  openingAmountCents: 500000,
  expectedAmountCents: 500000,
  countedAmountCents: null,
  differenceAmountCents: null,
  openedAtUtc: '2026-09-06T12:00:00.000Z',
  closedAtUtc: null,
  summary: {
    openingAmountCents: 500000,
    cashSalesAmountCents: 0,
    cashInAmountCents: 0,
    cashOutAmountCents: 0,
    expectedAmountCents: 500000,
    movementsCount: 1,
    salesCount: 0,
  },
  movements: [
    {
      id: 'mov-1',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      shiftId: 'shift-100',
      createdByUserId: 'u-1',
      type: 'OPENING',
      amountCents: 500000,
      signedAmountCents: 500000,
      reason: 'Fondo de apertura',
      saleId: null,
      idempotencyKey: 'idemp-1',
      createdAtUtc: '2026-09-06T12:00:00.000Z',
    },
  ],
  createdAt: '2026-09-06T12:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
};

const createMockAuthContext = (role: 'OWNER' | 'MANAGER' | 'CASHIER' = 'CASHIER') => ({
  status: 'AUTHENTICATED' as const,
  session: {
    sessionId: 'sess-1',
    userId: 'u-1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    membershipId: 'mem-1',
    role,
    user: { id: 'u-1', email: 'cajero@pulso.dev', name: 'Cajero Principal' },
    tenant: { id: 'tenant-1', name: 'Pulso Central', slug: 'pulso' },
    location: { id: 'loc-1', name: 'Sucursal Centro' },
    expiresAt: '',
  },
  errorMessage: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  retryBootstrap: vi.fn(),
});

const renderCashScreen = async (context = createMockAuthContext()) => {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <AuthContext.Provider value={context}>
        <CashScreen />
      </AuthContext.Provider>
    );
  });
  return result!;
};

describe('CashScreen Component - Cash Shift UI & Arqueo Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCashStore.getState().clearCashSession();
    useSalesStore.getState().setConnectionStatus('online');
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    useCashStore.getState().clearCashSession();
  });

  it('renders CashShiftOpenView when there is no active shift', async () => {
    await renderCashScreen();

    expect(screen.getByText(/SIN TURNO ABIERTO/i)).toBeDefined();
    expect(screen.getByTestId('open-shift-button')).toBeDefined();
    expect(screen.getByTestId('opening-amount-display')).toBeDefined();
  });

  it('allows entering initial float and opening cash shift', async () => {
    const openShiftSpy = vi.fn().mockResolvedValue(true);
    useCashStore.setState({ openShift: openShiftSpy });

    await renderCashScreen();

    // Click 5, 0, 0, 0, 0 on keypad -> 50000 = $500.00
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: '0' }));
      fireEvent.click(screen.getByRole('button', { name: '0' }));
    });

    const openBtn = screen.getByTestId('open-shift-button');
    await act(async () => {
      fireEvent.click(openBtn);
    });

    await waitFor(() => {
      expect(openShiftSpy).toHaveBeenCalledWith(50000, {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });
    });
  });

  it('disables opening shift and shows warning when connection is offline', async () => {
    useSalesStore.getState().setConnectionStatus('offline');

    await renderCashScreen();

    expect(screen.getByText(/Sin conexión.*requiere comunicación con el servidor/i)).toBeDefined();
    const openBtn = screen.getByTestId('open-shift-button');
    expect(openBtn.hasAttribute('disabled')).toBe(true);
  });
  it('renders CashShiftActiveView with KPI cards and action buttons when shift is active', async () => {
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);
    useCashStore.setState({ activeShift: mockShift });

    await renderCashScreen();

    expect(screen.getByText(/TURNO DE CAJA ABIERTO/i)).toBeDefined();
    expect(screen.getByText(/Control Operativo de Caja/i)).toBeDefined();
    expect(screen.getByTestId('open-cash-in-modal-button')).toBeDefined();
    expect(screen.getByTestId('open-cash-out-modal-button')).toBeDefined();
    expect(screen.getByTestId('open-close-shift-modal-button')).toBeDefined();
  });

  it('opens CashMovementModal for cash in and registers movement', async () => {
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);
    const cashInSpy = vi.fn().mockResolvedValue(true);
    useCashStore.setState({ activeShift: mockShift, registerCashIn: cashInSpy });

    await renderCashScreen();

    // Open cash in modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-cash-in-modal-button'));
    });
    expect(screen.getByText(/Ingreso Manual de Efectivo/i)).toBeDefined();

    // Type reason
    const reasonInput = screen.getByPlaceholderText(/Ej: Reposición de cambio chica/i);
    await act(async () => {
      fireEvent.change(reasonInput, { target: { value: 'Ingreso para cambio' } });
    });

    // Enter amount: click 5, 0, 0, 0
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '5' }));
      fireEvent.click(screen.getByRole('button', { name: '0' }));
    });

    const confirmBtn = screen.getByTestId('confirm-movement-button');
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(cashInSpy).toHaveBeenCalledWith(5000, 'Ingreso para cambio', {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });
    });
  });

  it('validates overdraft when attempting cash out exceeding expected cash', async () => {
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);
    useCashStore.setState({ activeShift: mockShift });

    await renderCashScreen();

    // Open cash out modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-cash-out-modal-button'));
    });
    expect(screen.getByText(/Retiro Manual de Efectivo/i)).toBeDefined();

    // Type reason
    const reasonInput = screen.getByPlaceholderText(/Ej: Pago a repartidor de hielo/i);
    await act(async () => {
      fireEvent.change(reasonInput, { target: { value: 'Retiro excesivo' } });
    });

    // Try to enter 999999 (which exceeds 500000 cents)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
      fireEvent.click(screen.getByRole('button', { name: '9' }));
    });

    // Confirmation button should be disabled due to overdraft
    const confirmBtn = screen.getByTestId('confirm-movement-button');
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    const amountDisplay = screen.getByTestId('movement-amount-display');
    expect(amountDisplay).toBeDefined();
  });

  it('opens CashShiftCloseModal and allows completing arqueo and closing shift', async () => {
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);
    const closeShiftSpy = vi.fn().mockResolvedValue(true);
    useCashStore.setState({ activeShift: mockShift, closeShift: closeShiftSpy });

    await renderCashScreen();

    // Open close shift modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-close-shift-modal-button'));
    });
    expect(screen.getByText(/Cierre y Arqueo de Caja/i)).toBeDefined();

    // Click "Copiar monto esperado" to match exactly ($ 5.000,00)
    const copyShortcutBtn = screen.getByRole('button', { name: /Copiar monto esperado/i });
    await act(async () => {
      fireEvent.click(copyShortcutBtn);
    });

    // Check difference badge displays ARQUEO EXACTO
    const diffBadge = screen.getByTestId('close-difference-badge');
    expect(diffBadge.textContent).toContain('ARQUEO EXACTO');

    // Confirm checkbox
    const confirmCheckbox = screen.getByTestId('confirm-close-checkbox');
    await act(async () => {
      fireEvent.click(confirmCheckbox);
    });

    // Submit close
    const submitCloseBtn = screen.getByTestId('submit-close-shift-button');
    await act(async () => {
      fireEvent.click(submitCloseBtn);
    });

    await waitFor(() => {
      expect(closeShiftSpy).toHaveBeenCalledWith(500000, {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });
    });
  });

  it('renders CashShiftClosedSummaryView after closing shift', async () => {
    const closedShift: CashShiftResponse = {
      ...mockShift,
      status: 'CLOSED',
      countedAmountCents: 500000,
      differenceAmountCents: 0,
      closedAtUtc: '2026-09-06T18:00:00.000Z',
      closedByUser: { id: 'u-1', name: 'Cajero Principal', email: 'cajero@pulso.dev' },
    };

    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(null);
    useCashStore.setState({ activeShift: null, lastClosedShift: closedShift });

    await renderCashScreen();

    expect(screen.getByText(/Turno de Caja Cerrado/i)).toBeDefined();
    expect(screen.getByTestId('shift-closed-difference-banner')).toBeDefined();
    expect(screen.getByTestId('start-new-shift-button')).toBeDefined();

    // Clicking start new shift dismisses the summary
    await act(async () => {
      fireEvent.click(screen.getByTestId('start-new-shift-button'));
    });
    expect(useCashStore.getState().lastClosedShift).toBeNull();
  });

  it('shows history subtab for OWNER and switches to history view', async () => {
    const loadHistorySpy = vi.fn().mockResolvedValue(undefined);
    useCashStore.setState({
      loadShiftHistory: loadHistorySpy,
      shiftHistory: [mockShift],
      historyTotal: 1,
    });

    await renderCashScreen(createMockAuthContext('OWNER'));

    const historyTabBtn = screen.getByTestId('cash-subtab-history');
    expect(historyTabBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(historyTabBtn);
    });

    expect(screen.getByText(/Historial de Turnos de Caja/i)).toBeDefined();
  });

  it('does not show history subtab for CASHIER role', async () => {
    await renderCashScreen(createMockAuthContext('CASHIER'));

    expect(screen.queryByTestId('cash-subtab-history')).toBeNull();
  });

  it('disables cash in, cash out, and close buttons and displays warning banner when offline with active shift', async () => {
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);
    useCashStore.setState({ activeShift: mockShift });
    useSalesStore.getState().setConnectionStatus('offline');

    await renderCashScreen();

    expect(
      screen.getByText(
        /Sin conexión.*operaciones de ingreso, retiro y cierre de caja están deshabilitadas/i
      )
    ).toBeDefined();

    const cashInBtn = screen.getByTestId('open-cash-in-modal-button');
    const cashOutBtn = screen.getByTestId('open-cash-out-modal-button');
    const closeBtn = screen.getByTestId('open-close-shift-modal-button');

    expect(cashInBtn.hasAttribute('disabled')).toBe(true);
    expect(cashOutBtn.hasAttribute('disabled')).toBe(true);
    expect(closeBtn.hasAttribute('disabled')).toBe(true);
  });

  it('displays pending offline sales banner separately without polluting confirmed cash balance', async () => {
    vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);
    useCashStore.setState({ activeShift: mockShift });
    useSalesStore.setState({ pendingSyncCount: 3 });

    await renderCashScreen();

    // Pending offline sales banner is visible with exact count
    expect(screen.getByText(/3/i)).toBeDefined();
    expect(
      screen.getByText(
        /venta\(s\) offline en cola.*efectivo se incorporará automáticamente al saldo confirmado/i
      )
    ).toBeDefined();

    // Confirmed expected cash remains strictly the server-confirmed amount ($5.000,00)
    const expectedKpi = screen.getByTestId('kpi-expected-amount');
    expect(expectedKpi.textContent).toContain('5.000,00');
  });
});
