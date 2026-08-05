import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM at rest for the dealer's ERP API key.
 *
 * The stored format is iv:tag:ciphertext, all base64url. GCM is used (not CBC)
 * so a tampered ciphertext fails to decrypt rather than silently yielding
 * garbage that we'd then send to the dealer's ERP as a bearer token.
 */

function keyFrom(appSecret: string): Buffer {
  return createHash('sha256').update(appSecret).digest();
}

export function encryptSecret(plaintext: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(appSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
    ':',
  );
}

export function decryptSecret(stored: string, appSecret: string): string {
  const [ivPart, tagPart, dataPart] = stored.split(':');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Stored secret is malformed');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(appSecret),
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Public embed key for the widget, and the ERP webhook shared secret. */
export function generateKey(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}
