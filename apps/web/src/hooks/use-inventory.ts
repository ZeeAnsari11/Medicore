'use client';

import { useMutation } from '@tanstack/react-query';
import type { Batch, CreateBatchAdjustmentRequest, InventoryRollup } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const INVENTORY_QUERY_KEY = ['inventory'];
export const INVENTORY_BATCHES_QUERY_KEY = ['inventory', 'batches'];

async function fetchRollup(branchId: string | null, search?: string, from?: string, to?: string): Promise<InventoryRollup[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (branchId) params.set('branchId', branchId);
  if (search) params.set('search', search);
  const query = params.toString();
  return apiFetch<InventoryRollup[]>(`/inventory${query ? `?${query}` : ''}`);
}

async function fetchBatchesForProduct(productId: string, branchId: string | null): Promise<Batch[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  const query = params.toString();
  return apiFetch<Batch[]>(`/inventory/${productId}/batches${query ? `?${query}` : ''}`);
}

async function createAdjustment(dto: CreateBatchAdjustmentRequest): Promise<Batch> {
  return apiFetch<Batch>('/inventory/adjustments', { method: 'POST', body: dto });
}

/** Stock rollup; with `from` / `to` (yyyy-mm-dd) it is the stock at the end of `to`, plus the movement since `from`. */
export function useInventory(branchId: string | null, search?: string, from?: string, to?: string) {
  const queryClient = useTenantQueryClient();

  const rollupQuery = useTenantQuery({
    queryKey: [...INVENTORY_QUERY_KEY, branchId, search, from, to],
    queryFn: () => fetchRollup(branchId, search, from, to),
    staleTime: 60 * 1000,
  });

  const adjustMutation = useMutation({
    mutationFn: createAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
      toast.success('Stock adjusted successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to adjust stock'),
  });

  return {
    rollup: rollupQuery.data ?? [],
    isLoading: rollupQuery.isLoading,
    error: rollupQuery.error,
    adjust: adjustMutation.mutateAsync,
    isAdjusting: adjustMutation.isPending,
    adjustError: adjustMutation.error,
  };
}

export function useProductBatches(productId: string | null, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...INVENTORY_BATCHES_QUERY_KEY, productId, branchId],
    queryFn: () => fetchBatchesForProduct(productId!, branchId),
    enabled: !!productId,
    staleTime: 30 * 1000,
  });

  return {
    batches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
