import React, { useState, useEffect } from 'react';
import { SalesScreen } from './features/sales/components/SalesScreen';
import { ProductsScreen } from './features/catalog/components/ProductsScreen';
import { SalesHistoryScreen } from './features/sales/components/SalesHistoryScreen';
import { OperationalRibbon } from '@pulso/ui';
import { useSalesStore } from './features/sales/store/sales.store';
import { useCatalogStore } from './features/catalog/store/catalog.store';
import { PwaInstallPrompt } from './features/pwa/PwaInstallPrompt';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { LoginScreen } from './features/auth/LoginScreen';
import { RegisterScreen } from './features/auth/RegisterScreen';
import { BootstrapScreen } from './features/auth/BootstrapScreen';
import { NetworkErrorScreen } from './features/auth/NetworkErrorScreen';
import { IconSale, IconStock, IconHistory } from '@pulso/icons';

const AppContent: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'night'>('light');
  const [unauthView, setUnauthView] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'pos' | 'products' | 'history'>('pos');

  const {
    connectionStatus,
    pendingSyncCount,
    quarantinedCount,
    toggleConnection,
    syncPendingSales,
    refreshPendingCount,
    recoverQuarantinedOperations,
  } = useSalesStore();
  const { status, session, logout, retryBootstrap } = useAuth();
  const { clearCatalog } = useCatalogStore();

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'night' : 'light'));
  };

  const handleLogout = async () => {
    clearCatalog();
    await logout();
  };

  useEffect(() => {
    if (session?.tenant?.id && session?.location?.id) {
      refreshPendingCount({ tenantId: session.tenant.id, locationId: session.location.id });
    }
  }, [session?.tenant?.id, session?.location?.id, refreshPendingCount]);

  // 1. Initial verification check
  if (status === 'INITIAL_CHECK') {
    return (
      <div data-theme={theme}>
        <BootstrapScreen />
      </div>
    );
  }

  // 2. Server connection failure (distinguished from 401)
  if (status === 'NETWORK_ERROR') {
    return (
      <div data-theme={theme}>
        <NetworkErrorScreen onRetry={retryBootstrap} />
      </div>
    );
  }

  // 3. Unauthenticated views: Login and Initial Business Registration
  if (status === 'UNAUTHENTICATED' || !session) {
    return (
      <div data-theme={theme}>
        {unauthView === 'login' ? (
          <LoginScreen onGoToRegister={() => setUnauthView('register')} />
        ) : (
          <RegisterScreen onGoToLogin={() => setUnauthView('login')} />
        )}
      </div>
    );
  }

  // 4. Authenticated Operational View
  const roleTranslated =
    session.role === 'OWNER' ? 'Propietario' : session.role === 'MANAGER' ? 'Encargado' : 'Cajero';

  const operationalContext = `${session.tenant.name} · ${session.location.name} · Sin turno abierto`;
  const operatorLabel = `${session.user.name} (${roleTranslated})`;
  const canManageCatalog = session.role === 'OWNER' || session.role === 'MANAGER';

  return (
    <div
      data-theme={theme}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
      }}
    >
      {/* Real Verified Operational Ribbon */}
      <OperationalRibbon
        connectionStatus={connectionStatus}
        pendingSyncCount={pendingSyncCount}
        shiftLabel={operationalContext}
        operatorName={operatorLabel}
        onToggleConnection={toggleConnection}
        onSyncClick={() =>
          syncPendingSales({ tenantId: session.tenant.id, locationId: session.location.id })
        }
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        <PwaInstallPrompt />

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Vistas principales"
          style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: 'rgba(0,0,0,0.15)',
            padding: '2px',
            borderRadius: 'var(--radius-xs)',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pos'}
            onClick={() => setActiveTab('pos')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: activeTab === 'pos' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'pos' ? 'var(--color-ink)' : 'var(--color-ribbon-text)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              cursor: 'pointer',
              minHeight: '28px',
            }}
          >
            <IconSale size={14} />
            <span>MOSTRADOR</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: activeTab === 'history' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'history' ? 'var(--color-ink)' : 'var(--color-ribbon-text)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 10px',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              cursor: 'pointer',
              minHeight: '28px',
            }}
          >
            <IconHistory size={14} />
            <span>HISTORIAL</span>
          </button>
          {canManageCatalog && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'products'}
              onClick={() => setActiveTab('products')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: activeTab === 'products' ? 'var(--color-surface)' : 'transparent',
                color: activeTab === 'products' ? 'var(--color-ink)' : 'var(--color-ribbon-text)',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                padding: '4px 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                cursor: 'pointer',
                minHeight: '28px',
              }}
            >
              <IconStock size={14} />
              <span>PRODUCTOS</span>
            </button>
          )}
        </div>

        {/* Accessible Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Cerrar sesión"
          title="Cerrar sesión operativa"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-ribbon-muted, rgba(255,255,255,0.25))',
            borderRadius: 'var(--radius-xs)',
            color: 'var(--color-ribbon-text)',
            padding: '4px 10px',
            fontSize: 'var(--text-xs)',
            fontWeight: 800,
            cursor: 'pointer',
            minHeight: '30px',
          }}
        >
          SALIR
        </button>
      </OperationalRibbon>

      {quarantinedCount > 0 && (
        <aside
          role="alert"
          aria-live="polite"
          data-testid="legacy-recovery-banner"
          style={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            borderBottom: '1px solid #ffeeba',
            padding: '8px 16px',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <span>
            ⚠️ <strong>Operaciones pendientes de recuperación:</strong> Se detectaron{' '}
            {quarantinedCount} operación(es) offline antiguas sin contexto asignado.
          </span>
          <button
            type="button"
            onClick={async () => {
              if (session?.tenant?.id && session?.location?.id) {
                await recoverQuarantinedOperations({
                  tenantId: session.tenant.id,
                  locationId: session.location.id,
                });
              }
            }}
            style={{
              backgroundColor: '#856404',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            Recuperar para este comercio
          </button>
        </aside>
      )}

      {/* Main View Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'history' ? (
          <SalesHistoryScreen />
        ) : canManageCatalog && activeTab === 'products' ? (
          <ProductsScreen />
        ) : (
          <SalesScreen />
        )}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};
