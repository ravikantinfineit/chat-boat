import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';

@Module({
  imports: [
    // Reads the workspace root .env so ERP_MOCK_* live alongside everything else.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class AppModule {}
