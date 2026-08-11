import { ExecutionContext, Injectable, CanActivate, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionResolverService } from '../../modules/roles/permission-resolver.service';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission requirement: allow
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Resolve fresh user state and permissions from DB
    const resolved = await this.permissionResolver.resolve(user);

    if (!resolved.isActive) {
      throw new ForbiddenException('User or role is inactive');
    }

    // Admins bypass permission checks
    if (resolved.isAdmin) {
      return true;
    }

    // Check if user has any of the required permissions (OR logic)
    const hasPermission = requiredPermissions.some((required) => resolved.permissions.includes(required));

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
