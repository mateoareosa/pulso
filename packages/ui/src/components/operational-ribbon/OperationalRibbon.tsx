import React from 'react';
import {
  IconWifi,
  IconWifiOff,
  IconSync,
  IconAlert,
  IconCash,
  IconDay,
  IconNight,
} from '@pulso/icons';

export interface OperationalRibbonProps {
  connectionStatus: 'online' | 'offline' | 'syncing';
  pendingSyncCount: number;
  shiftLabel: string;
  operatorName?: string;
  expectedCashFormatted?: string;
  alertMessage?: string;
  activeSection?: 'sales' | 'catalog';
  onSectionChange?: (section: 'sales' | 'catalog') => void;
  onSyncClick?: () => void;
  onToggleConnection?: () => void;
  theme?: 'light' | 'night';
  onToggleTheme?: () => void;
  children?: React.ReactNode;
}

export const OperationalRibbon: React.FC<OperationalRibbonProps> = ({
  connectionStatus,
  pendingSyncCount,
  shiftLabel,
  operatorName = 'Operador',
  expectedCashFormatted,
  alertMessage,
  activeSection,
  onSectionChange,
  onSyncClick,
  onToggleConnection,
  theme,
  onToggleTheme,
  children,
}) => {
  return (
    <div className="pulso-ribbon-wrapper">
      <header
        role="banner"
        className="pulso-ribbon"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '6px 16px',
          minHeight: '50px',
          backgroundColor: 'var(--color-ribbon-bg)',
          color: 'var(--color-ribbon-text)',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          borderBottom: '2px solid var(--color-ribbon-border)',
          userSelect: 'none',
          boxSizing: 'border-box',
          width: '100%',
          gap: '6px',
        }}
      >
        {/* Main Operational Row */}
        <div
          className="pulso-ribbon-main"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Brand Tag + Shift Context + Tabs */}
          <div
            className="pulso-ribbon-left"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontWeight: 900,
                letterSpacing: '1.2px',
                backgroundColor: 'var(--color-pulse-solid)',
                color: '#0f172a',
                padding: '3px 9px',
                borderRadius: 'var(--radius-xs)',
                fontSize: 'var(--text-xs)',
                textTransform: 'uppercase',
                boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
                flexShrink: 0,
              }}
            >
              PULSO
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                lineHeight: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{shiftLabel}</span>
              <span
                className="pulso-ribbon-op-sep"
                style={{ opacity: 0.4, fontSize: 'var(--text-xs)' }}
              >
                /
              </span>
              <span
                className="pulso-ribbon-operator"
                style={{
                  opacity: 0.85,
                  fontSize: 'var(--text-sm)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {operatorName}
              </span>
            </div>

            {/* Section Navigation Tabs when present */}
            {onSectionChange && (
              <nav
                aria-label="Navegación principal"
                className="pulso-ribbon-nav"
                style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}
              >
                <button
                  type="button"
                  onClick={() => onSectionChange('sales')}
                  aria-current={activeSection === 'sales' ? 'page' : undefined}
                  style={{
                    padding: '5px 12px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor:
                      activeSection === 'sales' ? 'var(--color-surface)' : 'transparent',
                    color:
                      activeSection === 'sales' ? 'var(--color-ink)' : 'var(--color-ribbon-text)',
                    fontWeight: activeSection === 'sales' ? 800 : 600,
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background-color var(--duration-fast) ease',
                  }}
                >
                  MOSTRADOR (VENTA)
                </button>
                <button
                  type="button"
                  onClick={() => onSectionChange('catalog')}
                  aria-current={activeSection === 'catalog' ? 'page' : undefined}
                  style={{
                    padding: '5px 12px',
                    border: 'none',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor:
                      activeSection === 'catalog' ? 'var(--color-surface)' : 'transparent',
                    color:
                      activeSection === 'catalog' ? 'var(--color-ink)' : 'var(--color-ribbon-text)',
                    fontWeight: activeSection === 'catalog' ? 800 : 600,
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background-color var(--duration-fast) ease',
                  }}
                >
                  CATÁLOGO COMPONENTES
                </button>
              </nav>
            )}
          </div>

          {/* Right: Actions, Cash, Sync, Connectivity, Theme */}
          <div
            className="pulso-ribbon-right"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {children}

            {/* Visual Theme Mode Toggle */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={`Cambiar a modo ${theme === 'light' ? 'noche' : 'día'}`}
                title={`Cambiar a modo ${theme === 'light' ? 'noche' : 'día'}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-ribbon-muted)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--color-ribbon-text)',
                  padding: '4px 8px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  minHeight: '30px',
                }}
              >
                {theme === 'night' ? (
                  <>
                    <IconNight size={14} aria-hidden="true" />
                    <span>NOCHE</span>
                  </>
                ) : (
                  <>
                    <IconDay size={14} aria-hidden="true" />
                    <span>DÍA</span>
                  </>
                )}
              </button>
            )}

            {/* Expected Cash in Register */}
            {expectedCashFormatted && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                }}
                title="Efectivo en caja esperado"
              >
                <IconCash size={16} />
                <span
                  className="pulso-ribbon-cash-label"
                  style={{ opacity: 0.65, fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}
                >
                  Caja:
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.2px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {expectedCashFormatted}
                </span>
              </div>
            )}

            {/* Sync queue indicator button */}
            {pendingSyncCount > 0 && (
              <button
                type="button"
                onClick={onSyncClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor:
                    connectionStatus === 'syncing'
                      ? 'var(--color-pulse-solid)'
                      : 'var(--color-amber-solid)',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  padding: '4px 8px',
                  fontWeight: 800,
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                  minHeight: '30px',
                  whiteSpace: 'nowrap',
                }}
                title="Operaciones pendientes de sincronización. Click para reintentar"
              >
                <IconSync size={14} className={connectionStatus === 'syncing' ? 'spin' : ''} />
                <span>{pendingSyncCount} pendientes</span>
              </button>
            )}

            {/* Connectivity Status Badge */}
            <button
              type="button"
              onClick={onToggleConnection}
              aria-label={`Estado de conexión: ${connectionStatus}. Click para alternar`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor:
                  connectionStatus === 'online'
                    ? 'var(--color-pulse-soft)'
                    : connectionStatus === 'syncing'
                      ? 'var(--color-amber-soft)'
                      : 'var(--color-tomato-solid)',
                color: connectionStatus === 'offline' ? '#ffffff' : 'var(--color-ink)',
                border:
                  connectionStatus === 'online'
                    ? '1px solid var(--color-pulse-border)'
                    : connectionStatus === 'syncing'
                      ? '1px solid var(--color-amber-border)'
                      : 'none',
                borderRadius: 'var(--radius-xs)',
                padding: '4px 10px',
                fontWeight: 800,
                fontSize: 'var(--text-xs)',
                cursor: onToggleConnection ? 'pointer' : 'default',
                letterSpacing: '0.6px',
                minHeight: '30px',
                whiteSpace: 'nowrap',
              }}
            >
              {connectionStatus === 'online' && (
                <>
                  <IconWifi size={14} />
                  <span>ONLINE</span>
                </>
              )}
              {connectionStatus === 'syncing' && (
                <>
                  <IconSync size={14} className="spin" />
                  <span>SINCRONIZANDO</span>
                </>
              )}
              {connectionStatus === 'offline' && (
                <>
                  <IconWifiOff size={14} />
                  <span>SIN CONEXIÓN</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dedicated Alert Sub-Row (Zero Overlap / Full Width) */}
        {alertMessage && (
          <div
            role="status"
            className="pulso-ribbon-alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--color-amber-solid)',
              color: '#0f172a',
              padding: '4px 10px',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              width: '100%',
              boxSizing: 'border-box',
              marginTop: '2px',
            }}
          >
            <IconAlert size={14} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{alertMessage}</span>
          </div>
        )}
      </header>
    </div>
  );
};
