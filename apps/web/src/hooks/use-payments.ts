'use client';

import { useMutation } from '@tanstack/react-query';
import type { Payment, CreatePaymentRequest, AllocatePaymentRequest, PartyType } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const PAYMENTS_QUERY_KEY = ['accounting', 'payments'];

async function fetchPayments(branchId: string | null, partyType?: PartyType, partyId?: string): Promise<Payment[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (partyType) params.set('partyType', partyType);
  if (partyId) params.set('partyId', partyId);
  const query = params.toString();
  return apiFetch<Payment[]>(`/accounting/payments${query ? `?${query}` : ''}`);
}

async function createPayment(dto: CreatePaymentRequest): Promise<Payment> {
  return apiFetch<Payment>('/accounting/payments', { method: 'POST', body: dto });
}

async function allocatePayment(branchId: string | null, id: string, dto: AllocatePaymentRequest): Promise<Payment> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Payment>(`/accounting/payments/${id}/allocate${query}`, { method: 'PATCH', body: dto });
}

async function voidPayment(branchId: string | null, id: string): Promise<void> {
  const query = branchId ? `?branchId=${branchId}` : '';
  await apiFetch(`/accounting/payments/${id}${query}`, { method: 'DELETE' });
}

export function usePayments(branchId: string | null, partyType?: PartyType, partyId?: string) {
  const queryClient = useTenantQueryClient();

  const query = useTenantQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, branchId, partyType, partyId],
    queryFn: () => fetchPayments(branchId, partyType, partyId),
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
  };

  const createMutation = useMutation({
    mutationFn: (dto: CreatePaymentRequest) => createPayment(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Payment recorded');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to record payment'),
  });

  const allocateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AllocatePaymentRequest }) => allocatePayment(branchId, id, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Advance applied');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to apply advance'),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidPayment(branchId, id),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Payment voided');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to void payment'),
  });

  return {
    payments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    allocate: (id: string, dto: AllocatePaymentRequest) => allocateMutation.mutateAsync({ id, dto }),
    isAllocating: allocateMutation.isPending,
    voidPayment: voidMutation.mutateAsync,
    isVoiding: voidMutation.isPending,
  };
}
