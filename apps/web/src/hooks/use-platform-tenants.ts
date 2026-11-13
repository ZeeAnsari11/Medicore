'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  AuthResponse,
  CreatePlatformTenantRequest,
  CreatePlatformTenantResponse,
  Tenant,
  TenantStatus,
  UpdateTenantRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const PLATFORM_TENANTS_QUERY_KEY = ['platform', 'tenants'];

async function fetchTenants(): Promise<Tenant[]> {
  return apiFetch<Tenant[]>('/platform/tenants');
}

async function createTenant(dto: CreatePlatformTenantRequest): Promise<CreatePlatformTenantResponse> {
  return apiFetch<CreatePlatformTenantResponse>('/platform/tenants', {
    method: 'POST',
    body: dto,
  });
}

async function fetchTenantWithAdmin(id: string): Promise<{ tenant: Tenant; adminUser: any }> {
  return apiFetch<{ tenant: Tenant; adminUser: any }>(`/platform/tenants/${id}`);
}

async function updateTenant(id: string, dto: UpdateTenantRequest): Promise<Tenant> {
  return apiFetch<Tenant>(`/platform/tenants/${id}`, {
    method: 'PATCH',
    body: dto,
  });
}

async function setTenantStatus(id: string, status: TenantStatus): Promise<Tenant> {
  return apiFetch<Tenant>(`/platform/tenants/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

async function impersonateTenant(id: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(`/platform/tenants/${id}/impersonate`, { method: 'POST' });
}

export function usePlatformTenants() {
  const queryClient = useTenantQueryClient();

  const tenantsQuery = useTenantQuery({
    queryKey: PLATFORM_TENANTS_QUERY_KEY,
    queryFn: fetchTenants,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: (data) => {
      queryClient.setQueryData(PLATFORM_TENANTS_QUERY_KEY, (old: Tenant[] | undefined) => [
        ...(old ?? []),
        data.tenant,
      ]);
      toast.success('Tenant created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to create tenant');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTenantRequest }) => updateTenant(id, dto),
    onSuccess: (tenant) => {
      queryClient.setQueryData(PLATFORM_TENANTS_QUERY_KEY, (old: Tenant[] | undefined) =>
        old ? old.map((t) => (t.id === tenant.id ? tenant : t)) : [tenant],
      );
      toast.success('Tenant updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update tenant');
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) => setTenantStatus(id, status),
    onSuccess: (tenant) => {
      queryClient.setQueryData(PLATFORM_TENANTS_QUERY_KEY, (old: Tenant[] | undefined) =>
        old ? old.map((t) => (t.id === tenant.id ? tenant : t)) : [tenant],
      );
      toast.success(`Tenant ${tenant.status.toLowerCase()}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update tenant status');
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: impersonateTenant,
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to log in as tenant admin');
    },
  });

  return {
    tenants: tenantsQuery.data ?? [],
    isLoading: tenantsQuery.isLoading,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    fetchTenantWithAdmin,
    update: (id: string, dto: UpdateTenantRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: (id: string, status: TenantStatus) => setStatusMutation.mutateAsync({ id, status }),
    isSettingStatus: setStatusMutation.isPending,
    impersonate: impersonateMutation.mutateAsync,
  };
}
