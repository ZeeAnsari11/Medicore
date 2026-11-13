import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { SystemRole, TenantRole } from '@medicore/shared-types';
import { CROSS_TENANT_KEY } from '../decorators/cross-tenant.decorator';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import { tenantStorage } from '../tenancy/tenant-context';
import { Branch, BranchDocument } from '../../modules/branches/schemas/branch.schema';

export const BRANCH_HEADER = 'x-branch-id';

/**
 * Must run right after JwtAuthGuard: binds the verified token's tenant and the branch scope to
 * the request. The user's branch and role come from the database (JwtStrategy refreshes them), so
 * a moved or demoted user is re-scoped immediately.
 *
 * Branch users are forced to their own branch; a different `X-Branch-Id` is a 403. Admins may send
 * `X-Branch-Id: <id>` (validated against the tenant's branches) or omit it / send `all`.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const { user } = req;
    const store = tenantStorage.getStore();
    if (!user || !store) return true;

    store.tenantId = user.tenantId;
    const crossTenant = this.reflector.getAllAndOverride<boolean>(CROSS_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (crossTenant && user.systemRole === SystemRole.SUPER_ADMIN) {
      store.bypass = true;
      return true;
    }

    const isAdmin = user.tenantRole === TenantRole.TENANT_SUPER_ADMIN || !!user.systemRole;
    const header = String(req.headers[BRANCH_HEADER] ?? '').trim();
    const requested = header && header !== 'all' ? header : undefined;

    if (!isAdmin) {
      if (requested && requested !== user.branchId) {
        throw new ForbiddenException('You do not have access to that branch');
      }
      store.branch = { canSeeAll: false, selectedBranchId: user.branchId };
      return true;
    }

    if (requested) {
      if (!isValidObjectId(requested)) throw new ForbiddenException('Invalid branch');
      const exists = await this.branchModel.exists({ _id: requested }); // tenant plugin adds tenantId
      if (!exists) throw new ForbiddenException('Branch does not belong to your tenant');
    }
    // Existence only: an inactive branch stays readable. Creates re-check `isActive` (branch-scope.plugin).
    store.branch = { canSeeAll: true, selectedBranchId: requested };
    return true;
  }
}
