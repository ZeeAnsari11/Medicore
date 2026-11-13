'use client';

import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

export interface PermissionActionDef {
  key: string;
  label: string;
}

export interface PermissionModuleDef {
  key: string;
  label: string;
  group: string;
  parent?: string;
  actions: PermissionActionDef[];
}

export interface PermissionTemplate {
  key: string;
  label: string;
  permissions: string[];
}

export interface UserPermissionsResponse {
  isAdmin: boolean;
  rolePermissions: string[];
  overrides: { grant: string[]; deny: string[] };
  permissions: string[];
}

/** Module and action definitions: the single source of truth for the permission matrix. */
export function usePermissionModules() {
  const query = useTenantQuery({
    queryKey: ['permissions', 'modules'],
    queryFn: () =>
      apiFetch<{ modules: PermissionModuleDef[]; templates: PermissionTemplate[] }>(
        '/permissions/modules',
      ),
    staleTime: 60 * 60 * 1000,
  });
  return {
    modules: query.data?.modules ?? [],
    templates: query.data?.templates ?? [],
    isLoading: query.isLoading,
  };
}

export function useUserPermissions(userId: string | undefined) {
  return useTenantQuery({
    queryKey: ['users', userId, 'permissions'],
    queryFn: () => apiFetch<UserPermissionsResponse>(`/users/${userId}/permissions`),
    enabled: !!userId,
    staleTime: 0,
  });
}

export function saveUserPermissions(userId: string, permissions: string[]) {
  return apiFetch<UserPermissionsResponse>(`/users/${userId}/permissions`, {
    method: 'PUT',
    body: { permissions },
  });
}
