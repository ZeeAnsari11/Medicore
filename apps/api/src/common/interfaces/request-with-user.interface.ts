import { Request } from 'express';
import { AuthenticatedUser } from '@medicore/shared-types';

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}
