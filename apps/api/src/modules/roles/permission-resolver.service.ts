import { Injectable } from '@nestjs/common';
import { AuthenticatedUser, SystemRole, TenantRole, UserStatus } from '@medicore/shared-types';
import { UsersService } from '../users/users.service';
import { RolesService } from './roles.service';
import {
  ALL_PERMISSION_KEYS,
  normalizePermissions,
} from '../permissions/permission-definitions';

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

    // Role template (fresh from DB) with the user's overrides applied on top
    const rolePermissions = await this.roleTemplatePermissions(
      dbUser.tenantId.toString(),
      dbUser.roleId?.toString(),
    );
    const permissions = this.applyOverrides(rolePermissions, dbUser.permissionOverrides);

    return { isAdmin: false, isActive: true, permissions };
  }

  /** Whether the caller holds a permission right now (used for field-level checks, e.g. prices). */
  async has(authUser: AuthenticatedUser, key: string): Promise<boolean> {
    const resolved = await this.resolve(authUser);
    return resolved.isActive && (resolved.isAdmin || resolved.permissions.includes(key));
  }

  /** Effective permissions of a role in the module-matrix vocabulary (legacy roles are expanded). */
  async roleTemplatePermissions(tenantId: string, roleId?: string): Promise<string[]> {
    if (!roleId) return [];
    const role = await this.rolesService.findById(tenantId, roleId);
    if (!role || !role.isActive) return [];
    return this.rolesService.effectiveKeys(role);
  }

  applyOverrides(
    rolePermissions: string[],
    overrides?: { grant?: string[]; deny?: string[] },
  ): string[] {
    const set = new Set(rolePermissions);
    overrides?.grant?.forEach((k) => set.add(k));
    overrides?.deny?.forEach((k) => set.delete(k));
    return normalizePermissions(set);
  }

  allKeys(): string[] {
    return ALL_PERMISSION_KEYS;
  }
}
