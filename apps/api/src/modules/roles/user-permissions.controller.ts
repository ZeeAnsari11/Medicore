import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { TenantRole, type AuthenticatedUser } from '@medicore/shared-types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { UsersService } from '../users/users.service';
import { PermissionAuditService } from '../users/permission-audit.service';
import { PermissionResolverService } from './permission-resolver.service';
import {
  MODULE_DEFINITIONS,
  ROLE_TEMPLATES,
  isKnownKey,
  normalizePermissions,
} from '../permissions/permission-definitions';

class UpdateUserPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}

@Controller()
export class UserPermissionsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly resolver: PermissionResolverService,
    private readonly audit: PermissionAuditService,
  ) {}

  /** Module/action definitions: the single source of truth for the permission matrix. */
  @Get('permissions/modules')
  modules() {
    return { modules: MODULE_DEFINITIONS, templates: ROLE_TEMPLATES };
  }

  @Get('me/permissions')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    const resolved = await this.resolver.resolve(user);
    return {
      isAdmin: resolved.isAdmin,
      permissions: resolved.isAdmin ? this.resolver.allKeys() : resolved.permissions,
    };
  }

  @RequirePermission('users:read')
  @Get('users/:id/permissions')
  async getForUser(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const target = await this.usersService.findByIdForTenant(actor.tenantId, id);
    if (!target) throw new NotFoundException('User not found');
    const isAdmin = target.tenantRole === TenantRole.TENANT_SUPER_ADMIN;
    const rolePermissions = await this.resolver.roleTemplatePermissions(
      actor.tenantId,
      target.roleId && (target.roleId as any)._id
        ? (target.roleId as any)._id.toString()
        : target.roleId?.toString(),
    );
    return {
      isAdmin,
      rolePermissions,
      overrides: target.permissionOverrides ?? { grant: [], deny: [] },
      permissions: isAdmin
        ? this.resolver.allKeys()
        : this.resolver.applyOverrides(rolePermissions, target.permissionOverrides),
    };
  }

  @RequirePermission('users:update')
  @Put('users/:id/permissions')
  async setForUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserPermissionsDto,
  ) {
    const target = await this.usersService.findByIdForTenant(actor.tenantId, id);
    if (!target) throw new NotFoundException('User not found');
    if (target.tenantRole === TenantRole.TENANT_SUPER_ADMIN) {
      throw new BadRequestException('Admin users always have full access and cannot be restricted');
    }
    const unknown = dto.permissions.filter((k) => !isKnownKey(k));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    }

    const desired = normalizePermissions(dto.permissions);
    if (actor.userId === id && !desired.includes('users:update')) {
      throw new ForbiddenException('You cannot remove your own ability to manage users');
    }

    const roleId =
      target.roleId && (target.roleId as any)._id
        ? (target.roleId as any)._id.toString()
        : target.roleId?.toString();
    const rolePermissions = await this.resolver.roleTemplatePermissions(actor.tenantId, roleId);
    const before = this.resolver.applyOverrides(rolePermissions, target.permissionOverrides);

    const desiredSet = new Set(desired);
    const roleSet = new Set(rolePermissions);
    const overrides = {
      grant: desired.filter((k) => !roleSet.has(k)),
      deny: rolePermissions.filter((k) => !desiredSet.has(k)),
    };
    await this.usersService.setPermissionOverrides(actor.tenantId, id, overrides);
    await this.audit.log({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      targetType: 'user',
      targetId: id,
      oldPermissions: before,
      newPermissions: desired,
    });

    return { isAdmin: false, rolePermissions, overrides, permissions: desired };
  }
}
