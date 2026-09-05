import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LiveReceipt, ReceiptItem } from '../src/components/live-receipt/LiveReceipt';

describe('LiveReceipt Component', () => {
  it('renders empty receipt state with scan prompt', () => {
    render(<LiveReceipt items={[]} totalFormatted="$ 0,00" />);
    expect(screen.getByText('Esperando productos...')).toBeDefined();
    expect(screen.getByText(/Escaneá código de barras o buscá/i)).toBeDefined();
  });

  it('renders active items list with quantities and prices', () => {
    const items: ReceiptItem[] = [
      {
        id: '1',
        productId: 'p1',
        name: 'Gaseosa Cola 500ml',
        quantity: 2,
        unitPriceFormatted: '$ 1.200,00',
        totalPriceFormatted: '$ 2.400,00',
      },
      {
        id: '2',
        productId: 'p2',
        name: 'Turrón de Maní',
        quantity: 1,
        unitPriceFormatted: '$ 450,00',
        totalPriceFormatted: '$ 450,00',
      },
    ];

    render(<LiveReceipt items={items} totalFormatted="$ 2.850,00" />);

    expect(screen.getByText('Gaseosa Cola 500ml')).toBeDefined();
    expect(screen.getByText('Turrón de Maní')).toBeDefined();
    expect(screen.getByText('$ 2.850,00')).toBeDefined();
    expect(screen.getByText('2x $ 1.200,00')).toBeDefined();
  });

  it('calls onRemoveItem when remove button is clicked', () => {
    const onRemove = vi.fn();
    const items: ReceiptItem[] = [
      {
        id: 'item-1',
        productId: 'p1',
        name: 'Alfajor',
        quantity: 1,
        unitPriceFormatted: '$ 800,00',
        totalPriceFormatted: '$ 800,00',
      },
    ];

    render(<LiveReceipt items={items} totalFormatted="$ 800,00" onRemoveItem={onRemove} />);

    const removeBtn = screen.getByLabelText('Quitar Alfajor');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('item-1');
  });
});
