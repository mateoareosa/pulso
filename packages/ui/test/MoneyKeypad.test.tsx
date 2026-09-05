import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  describe('Physical Keyboard Handling in Cash Tender', () => {
    it('accepts numbers from top row (0-9) and numpad (Numpad0-Numpad9)', () => {
      render(<MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />);

      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '5' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { code: 'Numpad0', key: '0' });

      // Received should display 1500
      expect(screen.getByText(/1500/)).toBeDefined();
    });

    it('handles Backspace to remove last digit and Delete to clear amount', () => {
      render(<MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />);

      fireEvent.keyDown(window, { key: '2' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: '0' });
      expect(screen.getByText(/200/)).toBeDefined();

      fireEvent.keyDown(window, { key: 'Backspace' });
      expect(screen.getByText(/20/)).toBeDefined();

      fireEvent.keyDown(window, { key: 'Delete' });
      expect(screen.getByTestId('received-amount').textContent).toContain('$ 0');
    });

    it('handles comma and period as decimal separator, preventing duplicates and negative values', () => {
      render(<MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />);

      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: ',' });
      fireEvent.keyDown(window, { key: '5' });

      // Trying duplicate separator should be ignored
      fireEvent.keyDown(window, { key: '.' });
      fireEvent.keyDown(window, { key: ',' });
      // Trying minus should be ignored
      fireEvent.keyDown(window, { key: '-' });

      // Second decimal digit
      fireEvent.keyDown(window, { key: '5' });
      expect(screen.getByText(/10.55|10,55/)).toBeDefined();

      // Third decimal digit should be rejected (max 2 decimals)
      fireEvent.keyDown(window, { key: '9' });
      expect(screen.getByText(/10.55|10,55/)).toBeDefined();
    });

    it('confirms on Enter when received amount is sufficient, and prevents double confirmation on repeat', () => {
      const onConfirm = vi.fn();
      render(<MoneyKeypad totalCents={100000} onConfirmTender={onConfirm} onCancel={vi.fn()} />);

      // Type 2000
      fireEvent.keyDown(window, { key: '2' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: '0' });

      // Press Enter
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith({
        receivedCents: 200000,
        changeCents: 100000,
      });

      // Key repeat on Enter should not trigger extra confirmation
      fireEvent.keyDown(window, { key: 'Enter', repeat: true });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does NOT confirm on Enter when received amount is insufficient', () => {
      const onConfirm = vi.fn();
      render(<MoneyKeypad totalCents={500000} onConfirmTender={onConfirm} onCancel={vi.fn()} />);

      // Type 100 (insufficient for 5000)
      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '0' });
      fireEvent.keyDown(window, { key: '0' });

      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('cancels on Escape key exactly once and prevents repeat cancellation', () => {
      const onCancel = vi.fn();
      render(<MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={onCancel} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.keyDown(window, { key: 'Escape', repeat: true });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('stops propagation of numeric keys to avoid triggering background shortcuts', () => {
      render(<MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />);

      const event = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true });
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      act(() => {
        window.dispatchEvent(event);
      });

      expect(stopSpy).toHaveBeenCalled();
    });

    it('removes event listener cleanly on unmount without leaking', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = render(
        <MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />
      );

      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('opening and closing repeatedly does not accumulate listeners', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount: unmount1 } = render(
        <MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />
      );
      unmount1();

      const { unmount: unmount2 } = render(
        <MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />
      );
      unmount2();

      const { unmount: unmount3 } = render(
        <MoneyKeypad totalCents={100000} onConfirmTender={vi.fn()} onCancel={vi.fn()} />
      );
      unmount3();

      const keydownAdds = addSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;
      const keydownRemoves = removeSpy.mock.calls.filter(([evt]) => evt === 'keydown').length;
      expect(keydownAdds).toBe(keydownRemoves);
    });
  });
});
