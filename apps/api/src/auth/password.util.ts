import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with node's built-in scrypt — a real KDF, and no native
 * dependency to compile or keep patched.
 *
 * Deliberately NOT `secret.util.ts`'s encryptSecret: that is reversible by
 * design and derives its key from a bare unsalted SHA-256, so anyone holding
 * APP_SECRET would recover every password.
 */

const N = 32768; // ~56ms per hash on this machine — costly to brute force, fine for a login
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** 128 * N * r is exactly node's 32MB default, so it must be raised or scrypt throws. */
const MAXMEM = 64 * 1024 * 1024;

/**
 * Returns `scrypt$N$r$p$salt$hash`.
 *
 * The cost parameters are stored per record so they can be raised later without
 * invalidating existing passwords — verification reads them back from the hash.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plaintext, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/** Constant-time verification. Returns false for malformed records rather than throwing. */
export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltPart, hashPart] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !saltPart || !hashPart) return false;

  const expected = Buffer.from(hashPart, 'base64url');
  const derived = await scrypt(plaintext, Buffer.from(saltPart, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * A throwaway hash to verify against when the email is unknown.
 *
 * Without it, a login for a non-existent account returns noticeably faster than
 * one for a real account with a wrong password, which leaks whether an address
 * is registered. Built lazily and memoised — this module compiles to CommonJS,
 * so there is no top-level await, and paying ~56ms at first login beats paying
 * it during boot.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHash;
}
