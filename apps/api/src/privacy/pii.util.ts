import { createHmac } from 'node:crypto';
import { decryptSecret, encryptSecret } from '../tenant/secret.util';

/**
 * Customer contact details at rest.
 *
 * Same AES-256-GCM as the dealer's ERP key — the difference is who is protected.
 * The ERP key protects the dealer; this protects the dealer's customers, who
 * never chose to be in our database and cannot rotate their own phone number.
 */

/** iv:tag:ciphertext, all base64url. */
const CIPHERTEXT_SHAPE = /^[\w-]+:[\w-]+:[\w-]*$/;

export function encryptPii(value: string, appSecret: string): string {
  return encryptSecret(value, appSecret);
}

/**
 * Reads a value written either before or after encryption was introduced.
 *
 * Rows predating the migration hold readable text, and a decrypt would throw on
 * them. Returning those unchanged is right: refusing to display a customer's own
 * name because of when it was stored helps nobody, and the backfill script
 * converts them. The shape test is strict enough that real ciphertext is never
 * mistaken for legacy plaintext.
 */
export function decryptPii(stored: string, appSecret: string): string {
  if (!CIPHERTEXT_SHAPE.test(stored)) return stored;
  try {
    return decryptSecret(stored, appSecret);
  } catch {
    // Written under a different APP_SECRET. Say so rather than leaking a stack
    // trace into an admin table or, worse, showing the raw ciphertext as a name.
    return '(unreadable — encrypted with a different key)';
  }
}

/**
 * A searchable fingerprint of an encrypted value.
 *
 * Encryption is randomised, so two rows holding the same phone number look
 * nothing alike and `WHERE customer_phone = ?` can never match. Without a blind
 * index the platform could not answer "delete everything about this customer",
 * which is the one privacy operation a dealer is legally obliged to perform.
 *
 * HMAC rather than a bare hash: a plain SHA-256 of a phone number is trivially
 * reversed by iterating the number space. Keyed, it is not — unless the key
 * leaks too, which is the same assumption the encryption already rests on.
 */
export function blindIndex(value: string, appSecret: string, kind: 'phone' | 'email'): string {
  return createHmac('sha256', `${appSecret}:blind-index:${kind}`)
    .update(normalise(value, kind))
    .digest('hex');
}

/**
 * The same human being types "+91 98765 43210" and "9876543210". Both must land
 * on one index entry, or erasure silently misses half their records.
 */
export function normalise(value: string, kind: 'phone' | 'email'): string {
  if (kind === 'email') return value.trim().toLowerCase();

  // Keep a leading +, drop every other non-digit.
  const digits = value.replace(/(?!^\+)\D/g, '');

  return (
    digits
      // The same Indian mobile is written +91 98765 43210, 09876543210 and
      // 9876543210 by the same person on different days. All three must land on
      // one index entry, or an erasure request silently misses half the records.
      // Both prefixes are only stripped when exactly ten digits follow, so a
      // genuine foreign number starting 91 or 0 is left alone.
      .replace(/^\+?91(?=\d{10}$)/, '')
      .replace(/^0(?=\d{10}$)/, '')
      .replace(/^\+/, '')
  );
}
