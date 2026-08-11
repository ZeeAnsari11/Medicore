import { Injectable } from '@nestjs/common';
import { AuthenticatedUser, SystemRole, TenantRole, UserStatus } from '@medicore/shared-types';
import { UsersService } from '../users/users.service';
import { RolesService } from './roles.service';
import { PermissionDocument } from '../permissions/schemas/permission.schema';

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

    // TENANT_USER with no role: no permissions
    if (!dbUser.roleId) {
      return { isAdmin: false, isActive: true, permissions: [] };
    }

    // Fetch role with active permissions only (Mongoose match filters the populate)
    const role = await this.rolesService.findActiveByIdPopulated(
      dbUser.tenantId.toString(),
      dbUser.roleId.toString(),
    );

    if (!role) {
      return { isAdmin: false, isActive: true, permissions: [] };
    }

    const permissions = (role.permissions as unknown as PermissionDocument[]).map((p) => p.key);

    return { isAdmin: false, isActive: true, permissions };
  }
}
