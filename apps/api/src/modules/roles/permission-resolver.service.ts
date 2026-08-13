import { Injectable } from '@nestjs/common';
import { AuthenticatedUser, SystemRole, TenantRole, UserStatus } from '@medicore/shared-types';
import { UsersService } from '../users/users.service';
import { RolesService } from './roles.service';

@Injectable()
export class PermissionResolverService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  async resolve(
    authUser: AuthenticatedUser,
  ): Promise<{ isAdmin: boolean; isActive: boolean; permissions: string[] }> {
    // SUPER_ADMIN bypasses all tenant-level checks
    if (authUser.systemRole === SystemRole.SUPER_ADMIN) {
      return { isAdmin: true, isActive: true, permissions: [] };
    }

    // Fetch fresh user state from DB (not trusting JWT)
    const dbUser = await this.usersService.findById(authUser.userId);

    if (!dbUser || dbUser.status !== UserStatus.ACTIVE) {
      return { isAdmin: false, isActive: false, permissions: [] };
    }

    // TENANT_SUPER_ADMIN has all permissions implicitly
    if (dbUser.tenantRole === TenantRole.TENANT_SUPER_ADMIN) {
      return { isAdmin: true, isActive: true, permissions: [] };
    }

    // TENANT_USER with no role: no modules accessible
    if (!dbUser.roleId) {
      return { isAdmin: false, isActive: true, permissions: [] };
    }

    // Fetch role and return its allowed modules
    const role = await this.rolesService.findById(
      dbUser.tenantId.toString(),
      dbUser.roleId.toString(),
    );

    if (!role || !role.isActive) {
      return { isAdmin: false, isActive: true, permissions: [] };
    }

    return { isAdmin: false, isActive: true, permissions: role.allowedModules };
  }
}
