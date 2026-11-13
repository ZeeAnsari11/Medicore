import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import {
  ImpersonationLog,
  ImpersonationLogDocument,
} from '../../modules/platform/schemas/impersonation-log.schema';

/**
 * Runs after TenantContextGuard. Impersonation tokens get exactly the impersonated user's access;
 * the only extra rule is that an ended or expired session stops working.
 */
@Injectable()
export class ImpersonationGuard implements CanActivate {
  constructor(
    @InjectModel(ImpersonationLog.name)
    private readonly logModel: Model<ImpersonationLogDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user?.impersonatedBy) return true;

    // An exit (or expiry) revokes the token even though the JWT itself is still valid.
    const session = user.impersonationSessionId
      ? await this.logModel
          .findOne({ _id: new Types.ObjectId(user.impersonationSessionId) })
          .lean()
          .exec()
      : null;
    if (!session || session.endedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Impersonation session has ended');
    }

    return true;
  }
}
