'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Sale, CreateSaleRequest, UpdateSalePaymentRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const SALES_QUERY_KEY = ['sales'];

async function fetchSales(branchId: string | null, customerId?: string): Promise<Sale[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (customerId) params.set('customerId', customerId);
  const query = params.toString();
  return apiFetch<Sale[]>(`/sales${query ? `?${query}` : ''}`);
}

async function createSale(dto: CreateSaleRequest): Promise<Sale> {
  return apiFetch<Sale>('/sales', { method: 'POST', body: dto });
}

async function updatePayment(id: string, branchId: string | null, dto: UpdateSalePaymentRequest): Promise<Sale> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Sale>(`/sales/${id}/payment${query}`, { method: 'PATCH', body: dto });
}

async function cancelSale(id: string, branchId: string | null): Promise<void> {
  const query = branchId ? `?branchId=${branchId}` : '';
  await apiFetch(`/sales/${id}${query}`, { method: 'DELETE' });
}

export function useSales(branchId: string | null, customerId?: string) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [...SALES_QUERY_KEY, branchId, customerId],
    queryFn: () => fetchSales(branchId, customerId),
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const createMutation = useMutation({
    mutationFn: createSale,
    onSuccess: (data) => {
      invalidate();
      toast.success(`Invoice ${data.invoiceNumber} created`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create sale'),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSalePaymentRequest }) => updatePayment(id, branchId, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Payment status updated');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update payment'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelSale(id, branchId),
    onSuccess: () => {
      invalidate();
      toast.success('Sale cancelled and stock restored');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to cancel sale'),
  });

  return {
    sales: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    updatePayment: (id: string, dto: UpdateSalePaymentRequest) => updatePaymentMutation.mutateAsync({ id, dto }),
    isUpdatingPayment: updatePaymentMutation.isPending,
    cancel: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}
