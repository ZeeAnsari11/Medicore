'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Purchase,
  CreatePurchaseRequest,
  UpdatePurchasePaymentRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const PURCHASES_QUERY_KEY = ['purchases'];

async function fetchPurchases(branchId: string | null, vendorId?: string): Promise<Purchase[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (vendorId) params.set('vendorId', vendorId);
  const query = params.toString();
  return apiFetch<Purchase[]>(`/purchases${query ? `?${query}` : ''}`);
}

async function fetchPurchase(id: string, branchId: string | null): Promise<Purchase> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Purchase>(`/purchases/${id}${query}`);
}

async function createPurchase(dto: CreatePurchaseRequest): Promise<Purchase> {
  return apiFetch<Purchase>('/purchases', { method: 'POST', body: dto });
}

async function updatePayment(id: string, branchId: string | null, dto: UpdatePurchasePaymentRequest): Promise<Purchase> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Purchase>(`/purchases/${id}/payment${query}`, { method: 'PATCH', body: dto });
}

async function cancelPurchase(id: string, branchId: string | null): Promise<void> {
  const query = branchId ? `?branchId=${branchId}` : '';
  await apiFetch(`/purchases/${id}${query}`, { method: 'DELETE' });
}

export function usePurchases(branchId: string | null, vendorId?: string) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [...PURCHASES_QUERY_KEY, branchId, vendorId],
    queryFn: () => fetchPurchases(branchId, vendorId),
    staleTime: 30 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: (data) => {
      invalidate();
      toast.success(`Purchase ${data.purchaseNumber} received`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create purchase'),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePurchasePaymentRequest }) =>
      updatePayment(id, branchId, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Payment status updated');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update payment'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelPurchase(id, branchId),
    onSuccess: () => {
      invalidate();
      toast.success('Purchase cancelled and stock reversed');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to cancel purchase'),
  });

  return {
    purchases: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    updatePayment: (id: string, dto: UpdatePurchasePaymentRequest) => updatePaymentMutation.mutateAsync({ id, dto }),
    isUpdatingPayment: updatePaymentMutation.isPending,
    cancel: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}

export function usePurchase(id: string | null, branchId: string | null) {
  const query = useQuery({
    queryKey: [...PURCHASES_QUERY_KEY, 'detail', id, branchId],
    queryFn: () => fetchPurchase(id!, branchId),
    enabled: !!id,
  });

  return { purchase: query.data, isLoading: query.isLoading, error: query.error };
}
