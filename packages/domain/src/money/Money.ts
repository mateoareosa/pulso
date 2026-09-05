/**
 * Money Value Object
 *
 * Implements strict integer-based currency representations (in cents / basic monetary units).
 * Floating-point numbers are strictly forbidden in internal representations and calculations
 * to avoid rounding errors and financial discrepancies.
 */
export class Money {
  private readonly _cents: number;

  private constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new TypeError(`Money cents must be an integer, received: ${cents}`);
    }
    this._cents = cents;
  }

  public static fromCents(cents: number): Money {
    return new Money(cents);
  }

  public static fromDecimal(decimalAmount: number): Money {
    if (typeof decimalAmount !== 'number' || Number.isNaN(decimalAmount)) {
      throw new TypeError(`Invalid decimal amount: ${decimalAmount}`);
    }
    // Round to avoid IEEE 754 precision issues when converting decimal to cents
    const cents = Math.round(decimalAmount * 100);
    return new Money(cents);
  }

  public static zero(): Money {
    return new Money(0);
  }

  public get cents(): number {
    return this._cents;
  }

  public toDecimal(): number {
    return this._cents / 100;
  }

  public add(other: Money): Money {
    return new Money(this._cents + other._cents);
  }

  public subtract(other: Money): Money {
    return new Money(this._cents - other._cents);
  }

  public multiply(factor: number): Money {
    if (Number.isNaN(factor)) {
      throw new TypeError(`Factor must be a valid number, received: ${factor}`);
    }
    return new Money(Math.round(this._cents * factor));
  }

  public equals(other: Money): boolean {
    return this._cents === other._cents;
  }

  public isLessThan(other: Money): boolean {
    return this._cents < other._cents;
  }

  public isGreaterThan(other: Money): boolean {
    return this._cents > other._cents;
  }

  public isZero(): boolean {
    return this._cents === 0;
  }

  public isPositive(): boolean {
    return this._cents > 0;
  }

  public isNegative(): boolean {
    return this._cents < 0;
  }

  public format(locale = 'es-AR', currency = 'ARS'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toDecimal());
  }

  public toString(): string {
    return this.format();
  }
}
