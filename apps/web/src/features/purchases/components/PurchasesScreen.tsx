import React, { useEffect, useState } from 'react';
import { usePurchasesStore } from '../store/purchases.store';
import { useCatalogStore } from '../../catalog/store/catalog.store';
import { useCashStore } from '../../cash/store/cash.store';
import { useSalesStore } from '../../sales/store/sales.store';
import { useAuth } from '../../auth/AuthContext';
import { PurchasesListView } from './PurchasesListView';
import { PurchaseEditorView } from './PurchaseEditorView';
import { SuppliersView } from './SuppliersView';

export const PurchasesScreen: React.FC = () => {
  const { session } = useAuth();
  const { connectionStatus } = useSalesStore();
  const { transitionPurchasesContext, loadSuppliers, loadPurchases, closePurchaseDetail } =
    usePurchasesStore();
  const {
    activeTenantId,
    activeLocationId,
    activePermissionRole,
    activeContextKey,
    permissionEpoch,
  } = usePurchasesStore();
  const { loadCatalog } = useCatalogStore();
  const { loadActiveShift } = useCashStore();

  const [activeSubTab, setActiveSubTab] = useState<'purchases' | 'create' | 'suppliers'>(
    'purchases'
  );

  const isOffline = connectionStatus === 'offline';
  const tenantId = session?.tenant?.id;
  const locationId = session?.location?.id;

  const isCashier = session?.role === 'CASHIER';
  const contextReady =
    activeTenantId === tenantId &&
    activeLocationId === locationId &&
    activePermissionRole === session?.role &&
    activeContextKey !== null;
  const [resumeDraft, setResumeDraft] = useState<
    import('@pulso/contracts').PurchaseDetailResponse | null
  >(null);

  useEffect(() => {
    if (tenantId && locationId) {
      // Transition first so stale data is cleared before any permitted loader starts.
      const context = transitionPurchasesContext({
        tenantId,
        locationId,
        permissionRole: session?.role ?? 'OWNER',
      });
      if (isCashier) return;
      loadSuppliers(context);
      loadPurchases(context);
      loadCatalog(tenantId, locationId);
      loadActiveShift({ tenantId, locationId });
    }
  }, [
    tenantId,
    locationId,
    isCashier,
    session?.role,
    transitionPurchasesContext,
    loadSuppliers,
    loadPurchases,
    loadCatalog,
    loadActiveShift,
  ]);

  useEffect(() => {
    setResumeDraft(null);
    setActiveSubTab('purchases');
    closePurchaseDetail();
  }, [tenantId, locationId, session?.role, closePurchaseDetail]);

  // Synchronously gate old-context surfaces before passive transition effects run.
  if (!contextReady && tenantId && locationId) return null;

  // Cashier Role Protection Guard
  if (isCashier) {
    return (
      <div
        data-testid="purchases-forbidden-banner"
        style={{
          padding: '32px 20px',
          maxWidth: '600px',
          margin: '40px auto',
          textAlign: 'center',
          backgroundColor: 'var(--color-danger-soft, #fee2e2)',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-sm, 8px)',
          color: 'var(--color-danger-solid)',
        }}
      >
        <h1 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800 }}>
          ACCESO RESTRINGIDO
        </h1>
        <p style={{ margin: 0, fontSize: '14px' }}>
          El rol de Cajero no tiene permisos para gestionar proveedores, registrar compras ni
          visualizar costos.
        </p>
      </div>
    );
  }

  const context = {
    tenantId: tenantId || '',
    locationId: locationId || '',
    ownerKey: activeContextKey || '',
    permissionEpoch,
    permissionRole: activePermissionRole || 'OWNER',
  };

  return (
    <div
      role="region"
      aria-label="Gestión de compras"
      style={{
        padding: '16px 20px',
        maxWidth: '1440px',
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-ink)',
      }}
    >
      {/* Offline Warning Banner */}
      {isOffline && (
        <div
          role="alert"
          data-testid="purchases-offline-banner"
          style={{
            backgroundColor: 'var(--color-danger-soft, #fee2e2)',
            color: 'var(--color-danger-solid)',
            border: '1px solid #fca5a5',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 16px',
            marginBottom: '16px',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--radius-sm, 8px)',
          }}
        >
          <span>
            ⚠️ <strong>Modo Sin Conexión:</strong> La gestión de proveedores y el registro de
            compras con impacto en stock y costos requieren conexión con el servidor. Las
            operaciones están temporalmente bloqueadas.
          </span>
        </div>
      )}

      {/* Subtabs Ribbon */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          padding: '12px 16px',
          backgroundColor: 'var(--color-surface-sunken)',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-md, 10px)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 900, letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
            Compras y proveedores
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mono)' }}>
            Historial, registro y gestión de proveedores
          </p>
        </div>
        <div role="tablist" aria-label="Vistas de compras" style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-pill, 999px)' }}>
          <button
            type="button"
            role="tab"
            data-testid="subtab-purchases-list"
            aria-selected={activeSubTab === 'purchases'}
            onClick={() => setActiveSubTab('purchases')}
            style={{
              padding: '8px 12px',
              border: 'none',
              backgroundColor: activeSubTab === 'purchases' ? 'var(--color-surface-sunken)' : 'transparent',
              borderRadius: 'var(--radius-pill, 999px)',
              fontWeight: 800,
              fontSize: 'var(--text-xs)',
              color:
                activeSubTab === 'purchases'
                  ? 'var(--color-success-text)'
                  : 'var(--color-ink)',
              cursor: 'pointer',
            }}
          >
            HISTORIAL DE COMPRAS
          </button>

          <button
            type="button"
            role="tab"
            data-testid="subtab-purchases-create"
            aria-selected={activeSubTab === 'create'}
            onClick={() => {
              setResumeDraft(null);
              closePurchaseDetail();
              setActiveSubTab('create');
            }}
            style={{
              padding: '8px 12px',
              border: 'none',
              backgroundColor: activeSubTab === 'create' ? 'var(--color-surface-sunken)' : 'transparent',
              borderRadius: 'var(--radius-pill, 999px)',
              fontWeight: 800,
              fontSize: 'var(--text-xs)',
              color:
                activeSubTab === 'create'
                  ? 'var(--color-success-text)'
                  : 'var(--color-ink)',
              cursor: 'pointer',
            }}
          >
            NUEVA COMPRA
          </button>

          <button
            type="button"
            role="tab"
            data-testid="subtab-purchases-suppliers"
            aria-selected={activeSubTab === 'suppliers'}
            onClick={() => setActiveSubTab('suppliers')}
            style={{
              padding: '8px 12px',
              border: 'none',
              backgroundColor: activeSubTab === 'suppliers' ? 'var(--color-surface-sunken)' : 'transparent',
              borderRadius: 'var(--radius-pill, 999px)',
              fontWeight: 800,
              fontSize: 'var(--text-xs)',
              color:
                activeSubTab === 'suppliers'
                  ? 'var(--color-success-text)'
                  : 'var(--color-ink)',
              cursor: 'pointer',
            }}
          >
            PROVEEDORES
          </button>
        </div>
      </header>

      {/* Subtab Content */}
      {activeSubTab === 'purchases' && (
        <PurchasesListView
          context={context}
          isOffline={isOffline}
          onOpenCreate={() => {
            setResumeDraft(null);
            setActiveSubTab('create');
          }}
          onResume={(draft) => {
            setResumeDraft(draft);
            closePurchaseDetail();
            setActiveSubTab('create');
          }}
        />
      )}

      {activeSubTab === 'create' && (
        <PurchaseEditorView
          context={context}
          isOffline={isOffline}
          onDone={() => {
            setResumeDraft(null);
            setActiveSubTab('purchases');
          }}
          existingDraft={resumeDraft}
          mode={resumeDraft ? 'resume' : 'create'}
        />
      )}

      {activeSubTab === 'suppliers' && <SuppliersView context={context} isOffline={isOffline} />}
    </div>
  );
};



