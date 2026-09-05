import React from 'react';
import { IconWifi, IconWifiOff, IconSync, IconAlert, IconCash } from '@pulso/icons';

export interface OperationalRibbonProps {
  connectionStatus: 'online' | 'offline' | 'syncing';
  pendingSyncCount: number;
  shiftLabel: string;
  operatorName?: string;
  expectedCashFormatted?: string;
  alertMessage?: string;
  onSyncClick?: () => void;
  onToggleConnection?: () => void;
}

export const OperationalRibbon: React.FC<OperationalRibbonProps> = ({
  connectionStatus,
  pendingSyncCount,
  shiftLabel,
  operatorName = 'Operador',
  expectedCashFormatted,
  alertMessage,
  onSyncClick,
  onToggleConnection,
}) => {
  return (
    <header
      role="banner"
      className="pulso-ribbon"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        backgroundColor: 'var(--color-ink)',
        color: 'var(--color-ticket)',
        fontSize: '0.85rem',
        borderBottom: '2px solid var(--color-ink)',
        userSelect: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Left: Brand + Shift */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            fontWeight: 900,
            letterSpacing: '1px',
            backgroundColor: 'var(--color-pulse)',
            color: 'var(--color-ink)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs)',
            fontSize: '0.8rem',
            textTransform: 'uppercase',
          }}
        >
          PULSO
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>{shiftLabel}</span>
          <span style={{ opacity: 0.5 }}>|</span>
          <span style={{ opacity: 0.8 }}>{operatorName}</span>
        </div>
      </div>

      {/* Center: Alerts / Status messages */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {alertMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--color-amber)',
              color: 'var(--color-ink)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 600,
              fontSize: '0.75rem',
            }}
          >
            <IconAlert size={14} />
            <span>{alertMessage}</span>
          </div>
        )}
      </div>

      {/* Right: Expected Cash + Connectivity + Pending Queue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {expectedCashFormatted && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
            }}
            title="Efectivo en caja esperado"
          >
            <IconCash size={16} />
            <span style={{ opacity: 0.7 }}>Caja:</span>
            <span style={{ fontWeight: 700 }}>{expectedCashFormatted}</span>
          </div>
        )}

        {/* Sync queue indicator */}
        {pendingSyncCount > 0 && (
          <button
            onClick={onSyncClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor:
                connectionStatus === 'syncing' ? 'var(--color-pulse)' : 'var(--color-amber)',
              color: 'var(--color-ink)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              padding: '3px 8px',
              fontWeight: 700,
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
            title="Operaciones pendientes de sincronización"
          >
            <IconSync size={14} className={connectionStatus === 'syncing' ? 'spin' : ''} />
            <span>{pendingSyncCount} pendientes</span>
          </button>
        )}

        {/* Connectivity Status Badge (clickable to simulate offline/online in prototype) */}
        <button
          onClick={onToggleConnection}
          aria-label={`Estado de conexión: ${connectionStatus}. Click para alternar`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor:
              connectionStatus === 'online'
                ? 'var(--color-pulse-subtle)'
                : connectionStatus === 'syncing'
                  ? 'var(--color-amber-subtle)'
                  : 'var(--color-tomato)',
            color: connectionStatus === 'offline' ? '#ffffff' : 'var(--color-ink)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            padding: '3px 10px',
            fontWeight: 700,
            fontSize: '0.75rem',
            cursor: onToggleConnection ? 'pointer' : 'default',
            letterSpacing: '0.5px',
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
    </header>
  );
};
