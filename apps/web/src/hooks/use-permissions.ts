'use client';

import { useAuth } from './use-auth';
import { SystemRole, TenantRole } from '@medicore/shared-types';

export function usePermissions() {
  const { user } = useAuth();

  const isAdmin =
    user?.tenantRole === TenantRole.TENANT_SUPER_ADMIN || user?.systemRole === SystemRole.SUPER_ADMIN;

  const permissions = user?.permissions ?? [];

  const has = (permission: string): boolean => {
    return isAdmin || permissions.includes(permission);
  };

  const hasAny = (...perms: string[]): boolean => {
    return isAdmin || perms.some((p) => permissions.includes(p));
  };

  return {
    has,
    hasAny,
    isAdmin,
    permissions,
  };
}
