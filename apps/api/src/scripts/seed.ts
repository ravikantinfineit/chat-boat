/**
 * Creates a development showroom pointed at the local mock ERP, so a fresh
 * clone has something to talk to without clicking through the admin panel.
 *
 *   pnpm --filter @diamond/api db:seed
 *
 * Idempotent: re-running updates the existing showroom rather than adding one.
 * Compiled with the app so it can reuse the real encryption helpers rather than
 * keeping a second copy of them in sync.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { encryptSecret, generateKey } from '../tenant/secret.util';

loadEnv({ path: resolve(__dirname, '../../../../.env'), quiet: true });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const appSecret = process.env.APP_SECRET ?? 'insecure-dev-secret-change-me-please';
  const erpBaseUrl = `http://localhost:${process.env.ERP_MOCK_PORT ?? 4010}`;
  const erpApiKey = process.env.ERP_MOCK_API_KEY ?? 'test-key';

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Showrooms belong to an organisation now; reuse the one the migration
    // created rather than making a second "default".
    const organisation = await prisma.organisation.upsert({
      where: { slug: 'default' },
      create: { name: 'Default Organisation', slug: 'default' },
      update: {},
    });

    const existing = await prisma.tenant.findFirst({ where: { name: 'Demo Diamonds' } });
    const data = {
      organisationId: organisation.id,
      name: 'Demo Diamonds',
      erpBaseUrl,
      erpApiKeyEncrypted: encryptSecret(erpApiKey, appSecret),
      companyId: 'abc-diamonds-001',
    };

    const tenant = existing
      ? await prisma.tenant.update({ where: { id: existing.id }, data })
      : await prisma.tenant.create({
          data: { ...data, widgetKey: generateKey('wk'), webhookSecret: generateKey('whsec') },
        });

    console.log(`${existing ? 'Updated' : 'Created'} showroom "${tenant.name}"`);
    console.log(`  id:         ${tenant.id}`);
    console.log(`  ERP:        ${tenant.erpBaseUrl}`);
    console.log(`  widget key: ${tenant.widgetKey}`);
    console.log(`\nPut this in apps/widget/.env:\n  VITE_WIDGET_KEY=${tenant.widgetKey}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
