import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { TenantAccessGuard } from './auth/tenant-access.guard';
import { CatalogModule } from './catalog/catalog.module';
import { ChatModule } from './chat/chat.module';
import configuration from './config/configuration';
import { ErpModule } from './erp/erp.module';
import { HoldsModule } from './holds/holds.module';
import { PrismaModule } from './prisma';
import { PrivacyModule } from './privacy/privacy.module';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // nest start runs from apps/api, so reach up to the workspace root .env.
      envFilePath: ['../../.env', '.env'],
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<string>('redis.url'));
        // A trailing /N selects a Redis database, which keeps our queues out of
        // whatever else is using this server.
        const db = url.pathname.replace('/', '');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: db ? Number(db) : 0,
          },
        };
      },
    }),

    PrismaModule,
    PrivacyModule,
    AuthModule,
    TenantModule,
    ErpModule,
    CatalogModule,
    HoldsModule,
    ChatModule,
    AdminModule,
  ],
  providers: [
    // Global, so a newly added controller is authenticated by default and
    // access requires an explicit @Public(). Order matters: SessionGuard
    // populates the user that TenantAccessGuard scopes against.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: TenantAccessGuard },
  ],
})
export class AppModule {}
