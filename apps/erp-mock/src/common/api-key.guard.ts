import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Spec 3.1 — every request from the chatbot must carry
 * `Authorization: Bearer <api_key>`.
 *
 * A real ERP would look the key up per company; here it is a single configured
 * value, so a wrong or missing key fails exactly as it would in production.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get<string>('ERP_MOCK_API_KEY') ?? 'test-key';
    const header = request.headers.authorization;

    if (header !== `Bearer ${expected}`) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    return true;
  }
}
