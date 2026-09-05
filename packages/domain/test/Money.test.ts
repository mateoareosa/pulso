import { describe, it, expect } from 'vitest';
import { Money } from '../src/money/Money';

describe('Money Value Object', () => {
  it('should create money from integer cents', () => {
    const money = Money.fromCents(15000);
    expect(money.cents).toBe(15000);
    expect(money.toDecimal()).toBe(150.0);
  });

  it('should throw if cents is not an integer', () => {
    expect(() => Money.fromCents(150.75)).toThrowError(/must be an integer/);
    expect(() => Money.fromCents(NaN)).toThrowError(/must be an integer/);
  });

  it('should create money from decimal accurately converting to cents', () => {
    const money = Money.fromDecimal(19.99);
    expect(money.cents).toBe(1999);
    expect(money.toDecimal()).toBe(19.99);
  });

  it('should add money amounts immutably without floating-point inaccuracy', () => {
    const m1 = Money.fromDecimal(0.1);
    const m2 = Money.fromDecimal(0.2);
    const sum = m1.add(m2);

    expect(sum.cents).toBe(30);
    expect(sum.toDecimal()).toBe(0.3);
    // original instances unchanged
    expect(m1.cents).toBe(10);
    expect(m2.cents).toBe(20);
  });

  it('should subtract money amounts immutably', () => {
    const total = Money.fromCents(5000);
    const paid = Money.fromCents(2000);
    const remaining = total.subtract(paid);

    expect(remaining.cents).toBe(3000);
  });

  it('should multiply money by an integer or decimal factor', () => {
    const unitPrice = Money.fromCents(350); // $3.50
    const total = unitPrice.multiply(3);

    expect(total.cents).toBe(1050);
  });

  it('should format money with standard currency formatting', () => {
    const m = Money.fromCents(125050);
    expect(m.format('es-AR')).toMatch(/\$|1\.250,50/);
  });

  it('should evaluate equality and comparisons', () => {
    const m1 = Money.fromCents(100);
    const m2 = Money.fromCents(100);
    const m3 = Money.fromCents(200);

    expect(m1.equals(m2)).toBe(true);
    expect(m1.isLessThan(m3)).toBe(true);
    expect(m3.isGreaterThan(m1)).toBe(true);
    expect(Money.zero().isZero()).toBe(true);
  });
});
