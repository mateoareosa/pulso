import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MoneyKeypad } from '../src/components/money-keypad/MoneyKeypad';

describe('MoneyKeypad Component', () => {
  it('renders target total and calculates change dynamically', () => {
    const onConfirm = vi.fn();
    render(
      <MoneyKeypad
        totalCents={250000} // $2500.00
        onConfirmTender={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('TOTAL A COBRAR')).toBeDefined();

    // Click quick cash button $5.000
    const btn5000 = screen.getByText('+$5.000');
    fireEvent.click(btn5000);

    // Received: $5.000, Change: $2.500
    expect(screen.getByText('Vuelto')).toBeDefined();
  });

  it('allows clicking exact amount and confirming', () => {
    const onConfirm = vi.fn();
    render(<MoneyKeypad totalCents={150000} onConfirmTender={onConfirm} onCancel={vi.fn()} />);

    // Click "EXACTO"
    const exactBtn = screen.getByText('EXACTO');
    fireEvent.click(exactBtn);

    // Confirm button
    const confirmBtn = screen.getByText(/CONFIRMAR COBRO/i);
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith({
      receivedCents: 150000,
      changeCents: 0,
    });
  });
});
