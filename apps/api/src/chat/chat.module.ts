import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage, Conversation } from '../database/entities';
import { ErpModule } from '../erp/erp.module';
import { HoldsModule } from '../holds/holds.module';
import { TenantModule } from '../tenant/tenant.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ToolExecutor } from './tool-executor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ChatMessage]),
    ErpModule,
    HoldsModule,
    TenantModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ToolExecutor],
  exports: [ChatService],
})
export class ChatModule {}
