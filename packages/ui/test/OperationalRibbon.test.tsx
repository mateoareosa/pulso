import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OperationalRibbon } from '../src/components/operational-ribbon/OperationalRibbon';

describe('OperationalRibbon Component', () => {
  it('renders online operational state with shift and expected cash', () => {
    render(
      <OperationalRibbon
        connectionStatus="online"
        pendingSyncCount={0}
        shiftLabel="Turno Tarde #14"
        operatorName="Operador"
        expectedCashFormatted="$ 45.200,00"
      />
    );

    expect(screen.getByText('Turno Tarde #14')).toBeDefined();
    expect(screen.getByText('ONLINE')).toBeDefined();
    expect(screen.getByText('$ 45.200,00')).toBeDefined();
  });

  it('renders offline warning state with pending sync badge', () => {
    render(
      <OperationalRibbon
        connectionStatus="offline"
        pendingSyncCount={3}
        shiftLabel="Turno Mañana"
        expectedCashFormatted="$ 12.000,00"
      />
    );

    expect(screen.getByText('SIN CONEXIÓN')).toBeDefined();
    expect(screen.getByText('3 pendientes')).toBeDefined();
  });

  it('renders syncing state badge correctly', () => {
    render(
      <OperationalRibbon
        connectionStatus="syncing"
        pendingSyncCount={1}
        shiftLabel="Turno Mañana"
      />
    );

    expect(screen.getByText('SINCRONIZANDO')).toBeDefined();
  });

  it('renders theme toggle with IconNight in light mode and calls onToggleTheme on click', () => {
    let toggled = false;
    render(
      <OperationalRibbon
        connectionStatus="online"
        pendingSyncCount={0}
        shiftLabel="Turno Mañana"
        theme="light"
        onToggleTheme={() => {
          toggled = true;
        }}
      />
    );

    const themeBtn = screen.getByRole('button', { name: 'Cambiar a modo noche' });
    expect(themeBtn).toBeDefined();
    expect(themeBtn.textContent).toContain('DÍA');

    // Icon should be decorative
    const svg = themeBtn.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');

    themeBtn.click();
    expect(toggled).toBe(true);
  });

  it('renders theme toggle with IconDay in night mode', () => {
    render(
      <OperationalRibbon
        connectionStatus="online"
        pendingSyncCount={0}
        shiftLabel="Turno Mañana"
        theme="night"
        onToggleTheme={() => {}}
      />
    );

    const themeBtn = screen.getByRole('button', { name: 'Cambiar a modo día' });
    expect(themeBtn).toBeDefined();
    expect(themeBtn.textContent).toContain('NOCHE');

    const svg = themeBtn.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
