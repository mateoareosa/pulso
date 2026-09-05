import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ComponentCatalog } from '../src/components/catalog/ComponentCatalog';

describe('ComponentCatalog Component', () => {
  it('renders all 4 tabs in navigation without truncation', () => {
    render(<ComponentCatalog />);

    const tabsNav = screen.getByRole('navigation', { name: 'Secciones del catálogo' });
    expect(tabsNav).toBeDefined();

    expect(screen.getByRole('button', { name: /ESTADOS DEL SISTEMA/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /TICKET VIVO/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /CINTA OPERATIVA/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /COBRO EN EFECTIVO/i })).toBeDefined();
  });

  it('switches tabs when clicked', () => {
    render(<ComponentCatalog />);

    const receiptTabBtn = screen.getByRole('button', { name: /TICKET VIVO/i });
    fireEvent.click(receiptTabBtn);

    expect(receiptTabBtn.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Gaseosa Cola 500ml')).toBeDefined();
  });

  it('renders theme switcher with SVG icon and toggles theme', () => {
    render(<ComponentCatalog />);

    const themeBtn = screen.getByRole('button', { name: 'Cambiar a modo noche' });
    expect(themeBtn).toBeDefined();
    expect(themeBtn.textContent).toContain('MODO DÍA');

    // Decorative icon
    const svg = themeBtn.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');

    // Click to toggle to night mode
    fireEvent.click(themeBtn);

    expect(screen.getByRole('button', { name: 'Cambiar a modo día' })).toBeDefined();
    expect(themeBtn.textContent).toContain('MODO NOCHE');
  });
});
