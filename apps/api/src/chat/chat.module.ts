import { Module } from '@nestjs/common';
import { ErpModule } from '../erp/erp.module';
import { HoldsModule } from '../holds/holds.module';
import { TenantModule } from '../tenant/tenant.module';
import { ChatLimitsService } from './chat-limits.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ToolExecutor } from './tool-executor';

@Module({
  imports: [ErpModule, HoldsModule, TenantModule],
  controllers: [ChatController],
  providers: [ChatService, ToolExecutor, ChatLimitsService],
  exports: [ChatService],
})
export class ChatModule {}
