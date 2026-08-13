import { useAuth } from './use-auth';

export function usePermissions() {
  const { user } = useAuth();

  // Compare strings directly (enums can have import issues)
  const isAdmin =
    user?.tenantRole === 'TENANT_SUPER_ADMIN' || user?.systemRole === 'SUPER_ADMIN';

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
