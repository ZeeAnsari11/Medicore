'use client';

import { useAuth } from './use-auth';
import { SystemRole, TenantRole } from '@medicore/shared-types';
import { can } from '@medicore/ui';
import { navSections } from '@/components/layout/nav-config';

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

  /** Any module `view` at all; false means the account has nothing assigned. */
  const hasAnyModule = isAdmin || permissions.some((p) => p.endsWith(':read'));

  /** First nav page the user may open: the redirect target for URLs they can't access. */
  const firstAllowedHref = (): string | null => {
    const subject = isAdmin ? ['*'] : permissions;
    for (const section of navSections) {
      for (const item of section.items) {
        if (can(subject, item.requires)) return item.href;
      }
    }
    return null;
  };

  return {
    has,
    hasAny,
    hasAnyModule,
    firstAllowedHref,
    isAdmin,
    permissions,
  };
}
