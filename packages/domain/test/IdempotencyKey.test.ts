import { describe, it, expect } from 'vitest';
import { IdempotencyKey } from '../src/idempotency/IdempotencyKey';

describe('IdempotencyKey Value Object', () => {
  it('should generate a valid UUID v4 formatted key', () => {
    const key = IdempotencyKey.generate();
    expect(key.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should construct from a valid string and validate properly', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const key = IdempotencyKey.fromString(validUuid);
    expect(key.value).toBe(validUuid);
  });

  it('should reject invalid keys', () => {
    expect(() => IdempotencyKey.fromString('')).toThrowError(/Invalid idempotency key/);
    expect(() => IdempotencyKey.fromString('short-key')).toThrowError(/Invalid idempotency key/);
  });
});
