import React, { useEffect, useState } from 'react';
import { useCashStore } from '../store/cash.store';
import { useSalesStore } from '../../sales/store/sales.store';
import { useAuth } from '../../auth/AuthContext';
import { CashShiftOpenView } from './CashShiftOpenView';
import { CashShiftActiveView } from './CashShiftActiveView';
import { CashShiftClosedSummaryView } from './CashShiftClosedSummaryView';
import { CashShiftsHistoryView } from './CashShiftsHistoryView';
import { CashShiftDetailModal } from './CashShiftDetailModal';
import { IconCash, IconHistory } from '@pulso/icons';

export const CashScreen: React.FC = () => {
  const { session } = useAuth();
  const { connectionStatus, pendingSyncCount } = useSalesStore();

  const {
    activeShift,
    lastClosedShift,
    isSubmitting,
    error,
    shiftHistory,
    historyTotal,
    historyPage,
    historyLimit,
    historyTotalPages,
    isLoadingHistory,
    historyError,
    selectedShiftDetail,
    isLoadingDetail,
    detailError,
    loadActiveShift,
    openShift,
    registerCashIn,
    registerCashOut,
    closeShift,
    loadShiftHistory,
    loadShiftDetail,
    closeShiftDetail,
    dismissLastClosedSummary,
  } = useCashStore();

  const isOffline = connectionStatus === 'offline';
  const canViewHistory = session?.role === 'OWNER' || session?.role === 'MANAGER';
  const [activeSubTab, setActiveSubTab] = useState<'current' | 'history'>('current');

  const tenantId = session?.tenant?.id;
  const locationId = session?.location?.id;

  useEffect(() => {
    if (tenantId && locationId) {
      loadActiveShift({ tenantId, locationId });
    }
  }, [tenantId, locationId, loadActiveShift]);

  const handleOpenShift = async (amountCents: number) => {
    if (!tenantId || !locationId) return false;
    return await openShift(amountCents, { tenantId, locationId });
  };

  const handleCashIn = async (amountCents: number, reason: string) => {
    if (!tenantId || !locationId) return false;
    return await registerCashIn(amountCents, reason, { tenantId, locationId });
  };

  const handleCashOut = async (amountCents: number, reason: string) => {
    if (!tenantId || !locationId) return false;
    return await registerCashOut(amountCents, reason, { tenantId, locationId });
  };

  const handleCloseShift = async (countedAmountCents: number) => {
    if (!tenantId || !locationId) return false;
    return await closeShift(countedAmountCents, { tenantId, locationId });
  };

  const handleFetchHistory = (params: Parameters<typeof loadShiftHistory>[1]) => {
    if (!tenantId || !locationId) return;
    loadShiftHistory({ tenantId, locationId }, params);
  };

  const handleSelectHistoricalShift = (id: string) => {
    if (!tenantId || !locationId) return;
    loadShiftDetail(id, { tenantId, locationId });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
      {/* Sub-navigation bar for Owner/Manager */}
      {canViewHistory && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.03))',
            borderBottom: '1px solid var(--color-border, rgba(0,0,0,0.1))',
          }}
        >
          <button
            type="button"
            data-testid="cash-subtab-current"
            onClick={() => setActiveSubTab('current')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 800,
              backgroundColor:
                activeSubTab === 'current' ? 'var(--color-surface, #fff)' : 'transparent',
              color:
                activeSubTab === 'current' ? 'var(--color-ink)' : 'var(--color-ink-muted, #666)',
              border: activeSubTab === 'current' ? '1px solid var(--color-border, #ccc)' : 'none',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: 'pointer',
            }}
          >
            <IconCash size={14} />
            <span>TURNO ACTUAL</span>
          </button>

          <button
            type="button"
            data-testid="cash-subtab-history"
            onClick={() => {
              setActiveSubTab('history');
              if (tenantId && locationId && shiftHistory.length === 0) {
                loadShiftHistory({ tenantId, locationId }, { page: 1, limit: historyLimit });
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 800,
              backgroundColor:
                activeSubTab === 'history' ? 'var(--color-surface, #fff)' : 'transparent',
              color:
                activeSubTab === 'history' ? 'var(--color-ink)' : 'var(--color-ink-muted, #666)',
              border: activeSubTab === 'history' ? '1px solid var(--color-border, #ccc)' : 'none',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: 'pointer',
            }}
          >
            <IconHistory size={14} />
            <span>HISTORIAL DE TURNOS</span>
          </button>
        </div>
      )}

      {/* Main View Area */}
      <div style={{ flex: 1, padding: '8px 0' }}>
        {activeSubTab === 'history' && canViewHistory ? (
          <CashShiftsHistoryView
            shifts={shiftHistory}
            total={historyTotal}
            page={historyPage}
            limit={historyLimit}
            totalPages={historyTotalPages}
            isLoading={isLoadingHistory}
            error={historyError}
            onFetch={handleFetchHistory}
            onSelectShift={handleSelectHistoricalShift}
          />
        ) : lastClosedShift && !activeShift ? (
          <CashShiftClosedSummaryView
            shift={lastClosedShift}
            onOpenNewShift={dismissLastClosedSummary}
          />
        ) : activeShift ? (
          <CashShiftActiveView
            shift={activeShift}
            isOffline={isOffline}
            isSubmitting={isSubmitting}
            pendingOfflineSalesCount={pendingSyncCount}
            onCashIn={handleCashIn}
            onCashOut={handleCashOut}
            onCloseShift={handleCloseShift}
          />
        ) : (
          <CashShiftOpenView
            onOpenShift={handleOpenShift}
            isSubmitting={isSubmitting}
            isOffline={isOffline}
            error={error}
          />
        )}
      </div>

      {/* Historical Detail Modal */}
      {selectedShiftDetail && (
        <CashShiftDetailModal
          shift={selectedShiftDetail}
          isLoading={isLoadingDetail}
          error={detailError}
          onClose={closeShiftDetail}
        />
      )}
    </div>
  );
};
