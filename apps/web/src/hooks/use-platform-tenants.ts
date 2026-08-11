'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePlatformTenantRequest, CreatePlatformTenantResponse, Tenant } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

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

export function usePlatformTenants() {
  const queryClient = useQueryClient();

  const tenantsQuery = useQuery({
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

  return {
    tenants: tenantsQuery.data ?? [],
    isLoading: tenantsQuery.isLoading,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
  };
}
