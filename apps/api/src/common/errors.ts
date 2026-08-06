/**
 * Domain errors, thrown by services and translated to HTTP once by
 * DomainExceptionFilter.
 *
 * Services stay free of HTTP concerns, and the chat tool executor can catch
 * these by type to decide what to hand back to the model instead of failing the
 * whole turn.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A tenant, conversation, hold or order that does not exist. */
export class ResourceNotFoundError extends DomainError {
  readonly code: string = 'not_found';

  constructor(resource: string, id?: string) {
    super(id ? `${resource} ${id} not found` : `${resource} not found`);
  }
}

/** The request is well-formed but conflicts with current state. */
export class ConflictError extends DomainError {
  readonly code: string = 'conflict';
}

/**
 * A stone moved between the customer seeing it and committing to it. Diamonds
 * are one-of-a-kind, so this is an expected outcome rather than a failure.
 */
export class DiamondUnavailableError extends ConflictError {
  override readonly code: string = 'diamond_unavailable';

  constructor(
    readonly diamondId: string,
    readonly stockStatus: string,
  ) {
    super(`Diamond ${diamondId} is no longer available (${stockStatus})`);
  }
}

/** The dealer's ERP was unreachable or answered with an error. */
export class ErpUnavailableError extends DomainError {
  readonly code: string = 'erp_unavailable';

  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
  }
}
