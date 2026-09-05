const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * IdempotencyKey Value Object
 *
 * Ensures all mutative requests (e.g. Sales, Cash Adjustments, Stock Shifts) carry
 * a client-generated UUID to guarantee exact-once execution even during connection retries
 * and offline sync replays.
 */
export class IdempotencyKey {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || typeof value !== 'string' || !UUID_REGEX.test(value)) {
      throw new Error(`Invalid idempotency key format. Expected UUID format, received: "${value}"`);
    }
    this._value = value.toLowerCase();
  }

  public static generate(): IdempotencyKey {
    let uuid: string;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      uuid = crypto.randomUUID();
    } else {
      uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    return new IdempotencyKey(uuid);
  }

  public static fromString(value: string): IdempotencyKey {
    return new IdempotencyKey(value);
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: IdempotencyKey): boolean {
    return this._value === other._value;
  }

  public toString(): string {
    return this._value;
  }
}
