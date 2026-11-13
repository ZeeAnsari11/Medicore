'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  Manufacturer,
  CreateManufacturerRequest,
  UpdateManufacturerRequest,
  UpdateManufacturerStatusRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const MANUFACTURERS_QUERY_KEY = ['manufacturers'];

async function fetchManufacturers(): Promise<Manufacturer[]> {
  return apiFetch<Manufacturer[]>('/manufacturers');
}

async function createManufacturer(dto: CreateManufacturerRequest): Promise<Manufacturer> {
  return apiFetch<Manufacturer>('/manufacturers', { method: 'POST', body: dto });
}

async function updateManufacturer(id: string, dto: UpdateManufacturerRequest): Promise<Manufacturer> {
  return apiFetch<Manufacturer>(`/manufacturers/${id}`, { method: 'PATCH', body: dto });
}

async function setManufacturerStatus(id: string, dto: UpdateManufacturerStatusRequest): Promise<Manufacturer> {
  return apiFetch<Manufacturer>(`/manufacturers/${id}/status`, { method: 'PATCH', body: dto });
}

export function useManufacturers() {
  const queryClient = useTenantQueryClient();

  const manufacturersQuery = useTenantQuery({
    queryKey: MANUFACTURERS_QUERY_KEY,
    queryFn: fetchManufacturers,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createManufacturer,
    onSuccess: (data, variables) => {
      queryClient.setQueryData(MANUFACTURERS_QUERY_KEY, (old: Manufacturer[] | undefined) => [...(old ?? []), data]);
      if (variables.alsoCreateVendor) {
        // The matching vendor now exists too — refresh vendor lists/pickers.
        queryClient.invalidateQueries({ queryKey: ['vendors'] });
        toast.success('Manufacturer and vendor created successfully');
      } else {
        toast.success('Manufacturer created successfully');
      }
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create manufacturer'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateManufacturerRequest }) => updateManufacturer(id, dto),
    onSuccess: (data) => {
      queryClient.setQueryData(MANUFACTURERS_QUERY_KEY, (old: Manufacturer[] | undefined) =>
        old ? old.map((m) => (m.id === data.id ? data : m)) : [data],
      );
      toast.success('Manufacturer updated successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update manufacturer'),
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setManufacturerStatus(id, { isActive }),
    onSuccess: (data) => {
      queryClient.setQueryData(MANUFACTURERS_QUERY_KEY, (old: Manufacturer[] | undefined) =>
        old ? old.map((m) => (m.id === data.id ? data : m)) : [data],
      );
      toast.success(`Manufacturer ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update status'),
  });

  return {
    manufacturers: manufacturersQuery.data ?? [],
    isLoading: manufacturersQuery.isLoading,
    error: manufacturersQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateManufacturerRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: (id: string, isActive: boolean) => setStatusMutation.mutateAsync({ id, isActive }),
    isSettingStatus: setStatusMutation.isPending,
  };
}
