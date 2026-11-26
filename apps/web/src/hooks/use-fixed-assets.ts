'use client';

import { useMutation } from '@tanstack/react-query';
import type { FixedAsset, CreateFixedAssetRequest, DisposeFixedAssetRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const ASSETS_QUERY_KEY = ['accounting', 'assets'];

export function useFixedAssets(branchId: string | null) {
  const queryClient = useTenantQueryClient();
  const query = useTenantQuery({
    queryKey: [...ASSETS_QUERY_KEY, branchId],
    queryFn: () => apiFetch<FixedAsset[]>(`/accounting/assets${branchId ? `?branchId=${branchId}` : ''}`),
    staleTime: 30 * 1000,
  });
  // Assets move the balance sheet, profit and loss and cash flow, so those are refreshed too.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['accounting'] });
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong');

  const create = useMutation({
    mutationFn: (dto: CreateFixedAssetRequest) => apiFetch<FixedAsset>('/accounting/assets', { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidate();
      toast.success('Asset added');
    },
    onError,
  });
  const dispose = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DisposeFixedAssetRequest }) =>
      apiFetch<FixedAsset>(`/accounting/assets/${id}/dispose`, { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidate();
      toast.success('Asset disposed');
    },
    onError,
  });

  return { assets: query.data ?? [], isLoading: query.isLoading, error: query.error, create, dispose };
}
