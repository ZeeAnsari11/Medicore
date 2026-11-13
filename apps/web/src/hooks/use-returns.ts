'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  SaleReturn,
  PurchaseReturn,
  CreateSaleReturnRequest,
  CreatePurchaseReturnRequest,
  ReturnableSaleItem,
  ReturnablePurchaseItem,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const SALE_RETURNS_QUERY_KEY = ['accounting', 'sale-returns'];
export const PURCHASE_RETURNS_QUERY_KEY = ['accounting', 'purchase-returns'];

async function fetchReturnableSaleItems(saleId: string): Promise<ReturnableSaleItem[]> {
  return apiFetch<ReturnableSaleItem[]>(`/accounting/returns/sale/returnable?saleId=${saleId}`);
}

async function createSaleReturn(dto: CreateSaleReturnRequest): Promise<SaleReturn> {
  return apiFetch<SaleReturn>('/accounting/returns/sale', { method: 'POST', body: dto });
}

async function fetchReturnablePurchaseItems(purchaseId: string): Promise<ReturnablePurchaseItem[]> {
  return apiFetch<ReturnablePurchaseItem[]>(`/accounting/returns/purchase/returnable?purchaseId=${purchaseId}`);
}

async function createPurchaseReturn(dto: CreatePurchaseReturnRequest): Promise<PurchaseReturn> {
  return apiFetch<PurchaseReturn>('/accounting/returns/purchase', { method: 'POST', body: dto });
}

export function useReturnableSaleItems(saleId: string | null) {
  const query = useTenantQuery({
    queryKey: [...SALE_RETURNS_QUERY_KEY, 'returnable', saleId],
    queryFn: () => fetchReturnableSaleItems(saleId!),
    enabled: !!saleId,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

export function useReturnablePurchaseItems(purchaseId: string | null) {
  const query = useTenantQuery({
    queryKey: [...PURCHASE_RETURNS_QUERY_KEY, 'returnable', purchaseId],
    queryFn: () => fetchReturnablePurchaseItems(purchaseId!),
    enabled: !!purchaseId,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

export function useSaleReturns() {
  const queryClient = useTenantQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: SALE_RETURNS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const createMutation = useMutation({
    mutationFn: createSaleReturn,
    onSuccess: () => {
      invalidate();
      toast.success('Sale return recorded');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to record return'),
  });

  return { create: createMutation.mutateAsync, isCreating: createMutation.isPending, createError: createMutation.error };
}

export function usePurchaseReturns() {
  const queryClient = useTenantQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PURCHASE_RETURNS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const createMutation = useMutation({
    mutationFn: createPurchaseReturn,
    onSuccess: () => {
      invalidate();
      toast.success('Purchase return recorded');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to record return'),
  });

  return { create: createMutation.mutateAsync, isCreating: createMutation.isPending, createError: createMutation.error };
}

/* Returns recorded against one purchase / sale (the "Return items" flow on the detail dialogs). */

type ReturnKind = 'purchase' | 'sale';

function docReturnsPath(kind: ReturnKind, docId: string, branchId: string | null) {
  const query = branchId ? `?branchId=${branchId}` : '';
  return `/${kind === 'purchase' ? 'purchases' : 'sales'}/${docId}/returns${query}`;
}

export function useDocumentReturns<T extends SaleReturn | PurchaseReturn>(
  kind: ReturnKind,
  docId: string | null,
  branchId: string | null,
) {
  const query = useTenantQuery({
    queryKey: ['accounting', `${kind}-returns`, 'document', docId, branchId],
    queryFn: () => apiFetch<T[]>(docReturnsPath(kind, docId!, branchId)),
    enabled: !!docId,
  });
  return { returns: query.data ?? [], isLoading: query.isLoading };
}

export function useCreateDocumentReturn(kind: ReturnKind, docId: string, branchId: string | null) {
  const queryClient = useTenantQueryClient();

  const mutation = useMutation({
    mutationFn: (dto: Omit<CreateSaleReturnRequest, 'saleId'> | Omit<CreatePurchaseReturnRequest, 'purchaseId'>) =>
      apiFetch<SaleReturn | PurchaseReturn>(docReturnsPath(kind, docId, branchId), {
        method: 'POST',
        body: dto,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: [kind === 'purchase' ? 'purchases' : 'sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(kind === 'purchase' ? 'Purchase return recorded' : 'Sale return recorded');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to record return'),
  });

  return { create: mutation.mutateAsync, isCreating: mutation.isPending };
}

/** Every recorded return of one kind (the history list on Accounting → Returns). */
export function useReturnsList<T extends SaleReturn | PurchaseReturn>(kind: ReturnKind) {
  const query = useTenantQuery({
    queryKey: ['accounting', `${kind}-returns`, 'list'],
    queryFn: () => apiFetch<T[]>(`/accounting/returns/${kind}`),
  });
  return { returns: query.data ?? [], isLoading: query.isLoading };
}
