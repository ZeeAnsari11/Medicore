import { SetMetadata } from '@nestjs/common';
import { SystemRole, TenantRole } from '@medicore/shared-types';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Array<TenantRole | SystemRole>) => SetMetadata(ROLES_KEY, roles);
