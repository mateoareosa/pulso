import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';

/**
 * Normalizes user email address by trimming surrounding whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, {
    algorithm: 2, // 2 = Algorithm.Argon2id in @node-rs/argon2
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Returns false on mismatch or invalid hash structure without throwing exceptions.
 */
export async function verifyPassword(passwordHash: string, candidate: string): Promise<boolean> {
  try {
    return await verify(passwordHash, candidate);
  } catch {
    return false;
  }
}

/**
 * Generates an opaque session token with at least 256 bits of cryptographic entropy (32 random bytes as hex).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Computes a deterministic SHA-256 hex digest for an opaque session token.
 * Only this hash is stored in PostgreSQL.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
