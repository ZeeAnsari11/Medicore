'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission, UpdatePermissionRequest, UpdatePermissionStatusRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';

export const PERMISSIONS_QUERY_KEY = ['permissions'];

async function fetchPermissions(): Promise<Permission[]> {
  return apiFetch<Permission[]>('/permissions');
}

async function createPermission(key: string, name: string, description: string | undefined, module: string): Promise<Permission> {
  return apiFetch<Permission>('/permissions', {
    method: 'POST',
    body: { key, name, description, module },
  });
}

async function updatePermission(id: string, dto: UpdatePermissionRequest): Promise<Permission> {
  return apiFetch<Permission>(`/permissions/${id}`, {
    method: 'PATCH',
    body: dto,
  });
}

async function setPermissionStatus(id: string, isActive: boolean): Promise<Permission> {
  return apiFetch<Permission>(`/permissions/${id}/status`, {
    method: 'PATCH',
    body: { isActive },
  });
}

async function deletePermission(id: string): Promise<void> {
  await apiFetch(`/permissions/${id}`, { method: 'DELETE' });
}

export function usePermissionCatalog() {
  const queryClient = useQueryClient();

  const permissionsQuery = useQuery({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: fetchPermissions,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: ({
      key,
      name,
      description,
      module,
    }: {
      key: string;
      name: string;
      description?: string;
      module: string;
    }) => createPermission(key, name, description, module),
    onSuccess: (data) => {
      queryClient.setQueryData(PERMISSIONS_QUERY_KEY, (old: Permission[] | undefined) => [
        ...(old ?? []),
        data,
      ]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePermissionRequest }) =>
      updatePermission(id, dto),
    onSuccess: (data) => {
      queryClient.setQueryData(PERMISSIONS_QUERY_KEY, (old: Permission[] | undefined) =>
        old ? old.map((p) => (p.id === data.id ? data : p)) : [data],
      );
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setPermissionStatus(id, isActive),
    onSuccess: (data) => {
      queryClient.setQueryData(PERMISSIONS_QUERY_KEY, (old: Permission[] | undefined) =>
        old ? old.map((p) => (p.id === data.id ? data : p)) : [data],
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePermission(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData(PERMISSIONS_QUERY_KEY, (old: Permission[] | undefined) =>
        old ? old.filter((p) => p.id !== id) : [],
      );
    },
  });

  return {
    permissions: permissionsQuery.data ?? [],
    isLoading: permissionsQuery.isLoading,
    error: permissionsQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: setStatusMutation.mutateAsync,
    isSettingStatus: setStatusMutation.isPending,
    setStatusError: setStatusMutation.error,
    delete: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
