import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChatModule } from './chat/chat.module';
import configuration from './config/configuration';
import { ErpModule } from './erp/erp.module';
import { HoldsModule } from './holds/holds.module';
import { PrismaModule } from './prisma';
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
    TenantModule,
    ErpModule,
    CatalogModule,
    HoldsModule,
    ChatModule,
    AdminModule,
  ],
})
export class AppModule {}
