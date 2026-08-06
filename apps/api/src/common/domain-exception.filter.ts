import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import {
  ConflictError,
  DomainError,
  ErpUnavailableError,
  ResourceNotFoundError,
} from './errors';

/**
 * Turns domain errors into HTTP responses in one place, so services can throw
 * meaningfully without importing Nest's HTTP exceptions.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(error);

    if (status >= 500) {
      this.logger.error(`${error.code}: ${error.message}`);
    }

    // The stream may already be open and partially written on a chat turn;
    // writing headers again would throw and mask the original error.
    if (response.headersSent) {
      response.end();
      return;
    }

    response.status(status).json({ error: error.code, message: error.message });
  }

  private statusFor(error: DomainError): number {
    if (error instanceof ResourceNotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConflictError) return HttpStatus.CONFLICT;
    // The dealer's system failed, not the caller's request.
    if (error instanceof ErpUnavailableError) return HttpStatus.BAD_GATEWAY;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
