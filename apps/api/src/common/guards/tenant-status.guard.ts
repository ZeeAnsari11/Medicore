import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SystemRole, TenantStatus } from '@medicore/shared-types';
import { TenantsService } from '../../modules/tenants/tenants.service';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();

    // No user means an unauthenticated/@Public() route — nothing to check here,
    // JwtAuthGuard already handled it. A SUPER_ADMIN's reserved tenant is never
    // suspended in practice, but the check is skipped for them regardless so a
    // stray toggle can never lock the platform owner out.
    if (!user || user.systemRole === SystemRole.SUPER_ADMIN) {
      return true;
    }

    const tenant = await this.tenantsService.findById(user.tenantId);
    if (!tenant || tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your organization has been suspended. Contact your administrator.',
      );
    }

    return true;
  }
}
