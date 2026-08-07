/**
 * Encrypts customer contact details written before encryption existed.
 *
 *   pnpm --filter @diamond/api encrypt-pii
 *
 * The application reads both shapes — a row that does not look like ciphertext
 * is returned as-is — so this is not required for correctness. It is required
 * for the property that makes the feature worth having: that a stolen database
 * dump contains no readable phone numbers. Rows left unconverted are exactly the
 * ones an attacker would read first.
 *
 * Idempotent, and doubles as a repair tool. Already-encrypted values are left
 * alone, but blind indexes are ALWAYS recomputed — phone normalisation can
 * change (it did, once, to fold the "09876543210" spelling onto the same entry),
 * and a stale index is invisible until an erasure request quietly finds nothing.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { blindIndex, decryptPii, encryptPii } from '../privacy/pii.util';

loadEnv({ path: resolve(__dirname, '../../../../.env'), quiet: true });

/** Matches what encryptSecret produces: iv:tag:ciphertext, base64url. */
const LOOKS_ENCRYPTED = /^[\w-]+:[\w-]+:[\w-]*$/;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    // Encrypting under the fallback dev secret and then deploying with a real
    // one would leave every row permanently unreadable.
    throw new Error('APP_SECRET is not set — refusing to encrypt under a default key');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    let converted = 0;
    let skipped = 0;

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { customerName: { not: null } },
          { customerPhone: { not: null } },
          { customerEmail: { not: null } },
        ],
      },
      select: { id: true, customerName: true, customerPhone: true, customerEmail: true },
    });

    for (const row of conversations) {
      const data = seal(row, appSecret);
      if (!data) {
        skipped++;
        continue;
      }
      await prisma.conversation.update({ where: { id: row.id }, data });
      converted++;
    }


    const holds = await prisma.hold.findMany({
      select: { id: true, customerName: true, customerPhone: true, customerEmail: true },
    });

    for (const row of holds) {
      const data = seal(row, appSecret);
      if (!data) {
        skipped++;
        continue;
      }
      await prisma.hold.update({ where: { id: row.id }, data });
      converted++;
    }

    console.log(`Updated ${converted} rows; ${skipped} needed no change.`);
  } finally {
    await prisma.$disconnect();
  }
}

interface ContactRow {
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

/**
 * Returns the columns to write, or null when the row is already correct.
 *
 * Encryption is skipped for values that are already ciphertext, but the index is
 * recomputed from the decrypted value either way — that is what makes this
 * usable as a repair after a normalisation change.
 */
function seal(row: ContactRow, appSecret: string) {
  const data: Record<string, string> = {};

  const readable = (value: string | null): string | null =>
    value === null || value === '' ? null : decryptPii(value, appSecret);

  const plain = (value: string | null): boolean =>
    value !== null && value !== '' && !LOOKS_ENCRYPTED.test(value);

  if (plain(row.customerName)) data.customerName = encryptPii(row.customerName!, appSecret);

  const phone = readable(row.customerPhone);
  if (phone) {
    if (plain(row.customerPhone)) data.customerPhone = encryptPii(phone, appSecret);
    data.customerPhoneIndex = blindIndex(phone, appSecret, 'phone');
  }

  const email = readable(row.customerEmail);
  if (email) {
    if (plain(row.customerEmail)) data.customerEmail = encryptPii(email, appSecret);
    data.customerEmailIndex = blindIndex(email, appSecret, 'email');
  }

  return Object.keys(data).length === 0 ? null : data;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
