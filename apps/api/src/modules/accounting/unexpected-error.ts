import { HttpException, InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * Lets an expected error (a 400/403/404 the code threw on purpose) pass through, and turns anything else into a 500
 * that says what failed instead of the bare "Internal server error". The full error is logged for the server console.
 */
export function explainUnexpected(logger: Logger, what: string, error: unknown): never {
  if (error instanceof HttpException) throw error;
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`${what} failed: ${message}`, error instanceof Error ? error.stack : undefined);
  throw new InternalServerErrorException(`${what} failed: ${message}`);
}
