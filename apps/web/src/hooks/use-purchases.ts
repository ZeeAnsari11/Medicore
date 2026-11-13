'use client';

import { keepPreviousData, useMutation } from '@tanstack/react-query';
import type {
  Purchase,
  PaginatedPurchases,
  PurchasePaymentRow,
  CreatePurchaseRequest,
  CreatePurchaseResponse,
  UpdatePurchasePaymentRequest,
  UpdatePurchaseRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import type { LastPrice } from '@/components/last-price-hint';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const PURCHASES_QUERY_KEY = ['purchases'];

export function useLastPurchasePrices(vendorId: string | null, productIds: string[], branchId: string | null) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  const query = useTenantQuery({
    queryKey: [...PURCHASES_QUERY_KEY, 'last-price', branchId, vendorId, ids],
    queryFn: () => {
      const params = new URLSearchParams({ vendorId: vendorId!, productIds: ids.join(',') });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<LastPrice[]>(`/purchases/last-price?${params}`);
    },
    enabled: !!vendorId && ids.length > 0,
    staleTime: 30 * 1000,
  });
  return new Map((query.data ?? []).map((r) => [r.productId, r]));
}

async function fetchPurchases(branchId: string | null, vendorId?: string): Promise<Purchase[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (vendorId) params.set('vendorId', vendorId);
  const query = params.toString();
  return apiFetch<Purchase[]>(`/purchases${query ? `?${query}` : ''}`);
}

export interface PurchaseListParams {
  branchId: string | null;
  vendorId?: string;
  paymentStatus?: string;
  returnStatus?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
}

async function fetchPurchasesPage(p: PurchaseListParams): Promise<PaginatedPurchases> {
  const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
  if (p.branchId) params.set('branchId', p.branchId);
  if (p.vendorId) params.set('vendorId', p.vendorId);
  if (p.paymentStatus) params.set('paymentStatus', p.paymentStatus);
  if (p.returnStatus) params.set('returnStatus', p.returnStatus);
  if (p.status) params.set('status', p.status);
  if (p.dateFrom) params.set('dateFrom', p.dateFrom);
  if (p.dateTo) params.set('dateTo', p.dateTo);
  if (p.search) params.set('search', p.search);
  return apiFetch<PaginatedPurchases>(`/purchases?${params}`);
}

/** Server-side filtered and paginated list for the Purchases page. */
export function usePurchasesPage(params: PurchaseListParams) {
  const query = useTenantQuery({
    queryKey: [...PURCHASES_QUERY_KEY, 'page', params],
    queryFn: () => fetchPurchasesPage(params),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return {
    purchases: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}

async function fetchPurchase(id: string, branchId: string | null): Promise<Purchase> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Purchase>(`/purchases/${id}${query}`);
}

async function fetchPurchasePayments(id: string, branchId: string | null): Promise<PurchasePaymentRow[]> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<PurchasePaymentRow[]>(`/purchases/${id}/payments${query}`);
}

async function createPurchase(dto: CreatePurchaseRequest): Promise<CreatePurchaseResponse> {
  return apiFetch<CreatePurchaseResponse>('/purchases', { method: 'POST', body: dto });
}

async function updatePayment(id: string, branchId: string | null, dto: UpdatePurchasePaymentRequest): Promise<Purchase> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Purchase>(`/purchases/${id}/payment${query}`, { method: 'PATCH', body: dto });
}

async function updatePurchase(id: string, branchId: string | null, dto: UpdatePurchaseRequest): Promise<Purchase> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Purchase>(`/purchases/${id}${query}`, { method: 'PATCH', body: dto });
}

async function cancelPurchase(id: string, branchId: string | null): Promise<void> {
  const query = branchId ? `?branchId=${branchId}` : '';
  await apiFetch(`/purchases/${id}${query}`, { method: 'DELETE' });
}

export function usePurchases(branchId: string | null, vendorId?: string) {
  const queryClient = useTenantQueryClient();

  const listQuery = useTenantQuery({
    queryKey: [...PURCHASES_QUERY_KEY, branchId, vendorId],
    queryFn: () => fetchPurchases(branchId, vendorId),
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PURCHASES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
    queryClient.invalidateQueries({ queryKey: ['vendors'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: (data) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Purchase ${data.purchaseNumber} received`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create purchase'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePurchaseRequest }) => updatePurchase(id, branchId, dto),
    onSuccess: (data) => {
      invalidate();
      toast.success(`Purchase ${data.purchaseNumber} updated`);
    },
    onError: (error) => {
      // 409 = a payment/return landed or stock was already sold: refresh so the invoice shows its real state.
      if (error instanceof ApiError && error.status === 409) invalidate();
      toast.error(error instanceof ApiError ? error.message : 'Failed to update purchase');
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePurchasePaymentRequest }) =>
      updatePayment(id, branchId, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Payment recorded');
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
    update: (id: string, dto: UpdatePurchaseRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    updatePayment: (id: string, dto: UpdatePurchasePaymentRequest) => updatePaymentMutation.mutateAsync({ id, dto }),
    isUpdatingPayment: updatePaymentMutation.isPending,
    cancel: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}

export function usePurchase(id: string | null, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...PURCHASES_QUERY_KEY, 'detail', id, branchId],
    queryFn: () => fetchPurchase(id!, branchId),
    enabled: !!id,
  });

  return { purchase: query.data, isLoading: query.isLoading, error: query.error };
}

/** Payment history for one purchase. Lives under the ['purchases'] key so recording a payment refreshes it. */
export function usePurchasePayments(id: string | null, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...PURCHASES_QUERY_KEY, 'payments', id, branchId],
    queryFn: () => fetchPurchasePayments(id!, branchId),
    enabled: !!id,
  });

  return { payments: query.data ?? [], isLoading: query.isLoading };
}
