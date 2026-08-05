import { BadRequestException, Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { ChatStreamEvent } from '@diamond/shared';
import { TenantService } from '../tenant/tenant.service';
import { ChatService } from './chat.service';

class SendMessageDto {
  @IsOptional()
  @IsString()
  conversation_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

/**
 * The widget's endpoint. Authenticated with the tenant's public widget key, not
 * the dealer's ERP key — the ERP credential never leaves the server.
 *
 * Replies stream back as Server-Sent Events so text appears as it is generated
 * and product cards land the moment a lookup returns.
 */
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly tenants: TenantService,
  ) {}

  @Post('message')
  async sendMessage(
    @Headers('x-widget-key') widgetKey: string | undefined,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    if (!widgetKey) throw new BadRequestException('Missing X-Widget-Key header');
    const tenant = await this.tenants.findByWidgetKey(widgetKey);

    const conversation = dto.conversation_id
      ? await this.chat.getConversation(tenant.id, dto.conversation_id)
      : await this.chat.startConversation(tenant, dto.channel ?? 'web');
    if (!conversation) throw new BadRequestException('Unknown conversation');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: ChatStreamEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    send({ type: 'conversation', conversation_id: conversation.id });

    try {
      for await (const event of this.chat.streamTurn(tenant, conversation, dto.text)) {
        send(event);
      }
    } catch (error) {
      send({ type: 'error', message: (error as Error).message });
    } finally {
      res.end();
    }
  }
}
