import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { tenantStorage } from './tenant-context';

/** Opens a mutable per-request store; TenantContextGuard fills it from the JWT. */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    tenantStorage.run({}, next);
  }
}
