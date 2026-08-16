'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Vendor,
  CreateVendorRequest,
  UpdateVendorRequest,
  UpdateVendorStatusRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const VENDORS_QUERY_KEY = ['vendors'];

async function fetchVendors(manufacturerId?: string): Promise<Vendor[]> {
  const query = manufacturerId ? `?manufacturerId=${manufacturerId}` : '';
  return apiFetch<Vendor[]>(`/vendors${query}`);
}

async function createVendor(dto: CreateVendorRequest): Promise<Vendor> {
  return apiFetch<Vendor>('/vendors', { method: 'POST', body: dto });
}

async function updateVendor(id: string, dto: UpdateVendorRequest): Promise<Vendor> {
  return apiFetch<Vendor>(`/vendors/${id}`, { method: 'PATCH', body: dto });
}

async function setVendorStatus(id: string, dto: UpdateVendorStatusRequest): Promise<Vendor> {
  return apiFetch<Vendor>(`/vendors/${id}/status`, { method: 'PATCH', body: dto });
}

export function useVendors(manufacturerId?: string) {
  const queryClient = useQueryClient();

  const vendorsQuery = useQuery({
    queryKey: [...VENDORS_QUERY_KEY, manufacturerId ?? null],
    queryFn: () => fetchVendors(manufacturerId),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createVendor,
    onSuccess: (data) => {
      queryClient.setQueryData(VENDORS_QUERY_KEY, (old: Vendor[] | undefined) => [...(old ?? []), data]);
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEY });
      toast.success('Vendor created successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create vendor'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVendorRequest }) => updateVendor(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEY });
      toast.success('Vendor updated successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update vendor'),
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setVendorStatus(id, { isActive }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: VENDORS_QUERY_KEY });
      toast.success(`Vendor ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update status'),
  });

  return {
    vendors: vendorsQuery.data ?? [],
    isLoading: vendorsQuery.isLoading,
    error: vendorsQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateVendorRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: (id: string, isActive: boolean) => setStatusMutation.mutateAsync({ id, isActive }),
    isSettingStatus: setStatusMutation.isPending,
  };
}
