'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role, CreateRoleRequest, UpdateRoleRequest, UpdateRoleStatusRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const ROLES_QUERY_KEY = ['roles'];

async function fetchRoles(): Promise<Role[]> {
  return apiFetch<Role[]>('/roles');
}

async function createRole(dto: CreateRoleRequest): Promise<Role> {
  return apiFetch<Role>('/roles', {
    method: 'POST',
    body: dto,
  });
}

async function updateRole(id: string, dto: UpdateRoleRequest): Promise<Role> {
  return apiFetch<Role>(`/roles/${id}`, {
    method: 'PATCH',
    body: dto,
  });
}

async function setRoleStatus(id: string, dto: UpdateRoleStatusRequest): Promise<Role> {
  return apiFetch<Role>(`/roles/${id}/status`, {
    method: 'PATCH',
    body: dto,
  });
}

async function deleteRole(id: string): Promise<void> {
  await apiFetch(`/roles/${id}`, { method: 'DELETE' });
}

export function useRoles() {
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: fetchRoles,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createRole,
    onSuccess: (data) => {
      queryClient.setQueryData(ROLES_QUERY_KEY, (old: Role[] | undefined) => [
        ...(old ?? []),
        data,
      ]);
      toast.success('Role created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to create role');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRoleRequest }) => updateRole(id, dto),
    onSuccess: (data) => {
      queryClient.setQueryData(ROLES_QUERY_KEY, (old: Role[] | undefined) =>
        old ? old.map((r) => (r.id === data.id ? data : r)) : [data],
      );
      toast.success('Role updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update role');
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setRoleStatus(id, { isActive }),
    onSuccess: (data) => {
      queryClient.setQueryData(ROLES_QUERY_KEY, (old: Role[] | undefined) =>
        old ? old.map((r) => (r.id === data.id ? data : r)) : [data],
      );
      toast.success(`Role ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update role status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(ROLES_QUERY_KEY, (old: Role[] | undefined) =>
        old ? old.filter((r) => r.id !== id) : [],
      );
      toast.success('Role deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to delete role');
    },
  });

  return {
    roles: rolesQuery.data ?? [],
    isLoading: rolesQuery.isLoading,
    error: rolesQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: async (id: string, dto: UpdateRoleRequest) => {
      return updateMutation.mutateAsync({ id, dto });
    },
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: async (id: string, isActive: boolean) => {
      return setStatusMutation.mutateAsync({ id, isActive });
    },
    isSettingStatus: setStatusMutation.isPending,
    setStatusError: setStatusMutation.error,
    delete: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
