/**
 * Creates a user from the command line.
 *
 * Deliberately not an HTTP route: there is no public signup, and a platform
 * admin must never be creatable by anything reachable from the internet.
 *
 *   node dist/scripts/create-user.js --email a@b.com --name "Asha" --password s3cret \
 *        [--org "Demo Diamonds Ltd"] [--role owner|admin|member] [--platform-admin]
 *
 * Omit --org with --platform-admin for platform staff, who belong to no
 * organisation. Re-running for an existing email resets that user's password.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../auth/password.util';

loadEnv({ path: resolve(__dirname, '../../../../.env'), quiet: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name');
  const password = arg('password');
  const orgName = arg('org');
  const role = (arg('role') ?? 'owner') as 'owner' | 'admin' | 'member';
  const isPlatformAdmin = process.argv.includes('--platform-admin');

  if (!email || !name || !password) {
    throw new Error('--email, --name and --password are required');
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  if (!orgName && !isPlatformAdmin) {
    throw new Error('Give --org, or --platform-admin for platform staff');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, passwordHash, platformRole: isPlatformAdmin ? 'platform_admin' : null },
      update: { name, passwordHash, platformRole: isPlatformAdmin ? 'platform_admin' : undefined },
    });

    if (orgName) {
      // Match on name as well as slug. Looking up by slug alone would silently
      // create a near-duplicate organisation whenever the name slugifies
      // differently from an existing one — and the user would land in the empty
      // copy, with none of the showrooms they expect.
      const existing = await prisma.organisation.findFirst({
        where: { OR: [{ slug: slugify(orgName) }, { name: { equals: orgName, mode: 'insensitive' } }] },
      });
      const organisation =
        existing ??
        (await prisma.organisation.create({ data: { name: orgName, slug: slugify(orgName) } }));
      await prisma.membership.upsert({
        where: { userId_organisationId: { userId: user.id, organisationId: organisation.id } },
        create: { userId: user.id, organisationId: organisation.id, role },
        update: { role },
      });
      console.log(`${user.email} is ${role} of "${organisation.name}"`);
    } else {
      console.log(`${user.email} is a platform admin`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
