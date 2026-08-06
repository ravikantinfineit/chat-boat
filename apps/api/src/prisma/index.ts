/**
 * Single import site for everything database-related, so feature code never
 * reaches into the generated client directly and the generator's output path
 * stays an implementation detail.
 */
export { PrismaService } from './prisma.service';
export { PrismaModule } from './prisma.module';

export { Prisma, Role, HoldStatus } from '../generated/prisma/client';
export type { Tenant, Conversation, ChatMessage, Hold } from '../generated/prisma/client';
