'use client';

import { keepPreviousData, useMutation } from '@tanstack/react-query';
import type {
  Sale,
  PaginatedSales,
  SalePaymentRow,
  CreateSaleRequest,
  UpdateSaleRequest,
  UpdateSalePaymentRequest,
  OrderBookerOption,
  ReassignOrderBookerRequest,
  PendingOrderBookerSummary,
  PendingOrderRow,
  ProcessOrdersRequest,
  ProcessOrdersResult,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import type { LastPrice } from '@/components/last-price-hint';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const SALES_QUERY_KEY = ['sales'];

async function fetchSales(
  branchId: string | null,
  customerId?: string,
  startDate?: string,
  endDate?: string,
): Promise<Sale[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (customerId) params.set('customerId', customerId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();
  return apiFetch<Sale[]>(`/sales${query ? `?${query}` : ''}`);
}

export interface SaleListParams {
  branchId: string | null;
  customerId?: string;
  orderBookerId?: string;
  paymentStatus?: string;
  returnStatus?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page: number;
  limit: number;
}

function salesFilterParams(p: SaleListParams, params: URLSearchParams): URLSearchParams {
  if (p.branchId) params.set('branchId', p.branchId);
  if (p.customerId) params.set('customerId', p.customerId);
  if (p.orderBookerId) params.set('orderBookerId', p.orderBookerId);
  if (p.paymentStatus) params.set('paymentStatus', p.paymentStatus);
  if (p.returnStatus) params.set('returnStatus', p.returnStatus);
  if (p.startDate) params.set('startDate', p.startDate);
  if (p.endDate) params.set('endDate', p.endDate);
  if (p.search) params.set('search', p.search);
  return params;
}

async function fetchSalesPage(p: SaleListParams): Promise<PaginatedSales> {
  const params = salesFilterParams(p, new URLSearchParams({ page: String(p.page), limit: String(p.limit) }));
  return apiFetch<PaginatedSales>(`/sales?${params}`);
}

/** PDF of every sale matching the filters (paging is ignored). */
export const salesReportPath = (p: SaleListParams) => `/sales/report/pdf?${salesFilterParams(p, new URLSearchParams())}`;

/** Server-side filtered and paginated list for the Sales page. */
export function useSalesPage(params: SaleListParams) {
  const query = useTenantQuery({
    queryKey: [...SALES_QUERY_KEY, 'page', params],
    queryFn: () => fetchSalesPage(params),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
  return {
    sales: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    summary: query.data?.summary,
    isLoading: query.isLoading,
    error: query.error,
  };
}

async function fetchSale(id: string, branchId: string | null): Promise<Sale> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Sale>(`/sales/${id}${query}`);
}

async function fetchSalePayments(id: string, branchId: string | null): Promise<SalePaymentRow[]> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<SalePaymentRow[]>(`/sales/${id}/payments${query}`);
}

async function createSale(dto: CreateSaleRequest): Promise<Sale> {
  return apiFetch<Sale>('/sales', { method: 'POST', body: dto });
}

async function updatePayment(id: string, branchId: string | null, dto: UpdateSalePaymentRequest): Promise<Sale> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Sale>(`/sales/${id}/payment${query}`, { method: 'PATCH', body: dto });
}

async function updateSale(id: string, branchId: string | null, dto: UpdateSaleRequest): Promise<Sale> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Sale>(`/sales/${id}${query}`, { method: 'PATCH', body: dto });
}

async function cancelSale(id: string, branchId: string | null): Promise<void> {
  const query = branchId ? `?branchId=${branchId}` : '';
  await apiFetch(`/sales/${id}${query}`, { method: 'DELETE' });
}

export function useLastSalePrices(customerId: string | null, productIds: string[], branchId: string | null) {
  const ids = [...new Set(productIds.filter(Boolean))].sort();
  const query = useTenantQuery({
    queryKey: [...SALES_QUERY_KEY, 'last-price', branchId, customerId, ids],
    queryFn: () => {
      const params = new URLSearchParams({ customerId: customerId!, productIds: ids.join(',') });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<LastPrice[]>(`/sales/last-price?${params}`);
    },
    enabled: !!customerId && ids.length > 0,
    staleTime: 30 * 1000,
  });
  return new Map((query.data ?? []).map((r) => [r.productId, r]));
}

export function useSales(branchId: string | null, customerId?: string, startDate?: string, endDate?: string) {
  const queryClient = useTenantQueryClient();

  const listQuery = useTenantQuery({
    queryKey: [...SALES_QUERY_KEY, branchId, customerId, startDate, endDate],
    queryFn: () => fetchSales(branchId, customerId, startDate, endDate),
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const createMutation = useMutation({
    mutationFn: createSale,
    onSuccess: (data) => {
      invalidate();
      toast.success(
        data.invoiceNumber
          ? `Invoice ${data.invoiceNumber} created`
          : `Order ${data.orderNumber} placed. It is waiting in Process Orders.`,
      );
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create sale'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSaleRequest }) => updateSale(id, branchId, dto),
    onSuccess: (data) => {
      invalidate();
      toast.success(`Invoice ${data.invoiceNumber} updated`);
    },
    onError: (error) => {
      // 409 = a payment or return landed meanwhile: refresh so the invoice shows as locked.
      if (error instanceof ApiError && error.status === 409) invalidate();
      toast.error(error instanceof ApiError ? error.message : 'Failed to update sale');
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateSalePaymentRequest }) => updatePayment(id, branchId, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Payment recorded');
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
    update: (id: string, dto: UpdateSaleRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    updatePayment: (id: string, dto: UpdateSalePaymentRequest) => updatePaymentMutation.mutateAsync({ id, dto }),
    isUpdatingPayment: updatePaymentMutation.isPending,
    cancel: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}

/** Live copy of one sale, so the detail dialog reflects a payment right after it is recorded. */
export function useSale(id: string | null, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...SALES_QUERY_KEY, 'detail', id, branchId],
    queryFn: () => fetchSale(id!, branchId),
    enabled: !!id,
  });

  return { sale: query.data, isLoading: query.isLoading };
}

/** Payment history for one sale. Lives under the ['sales'] key so recording a payment refreshes it. */
export function useSalePayments(id: string | null, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...SALES_QUERY_KEY, 'payments', id, branchId],
    queryFn: () => fetchSalePayments(id!, branchId),
    enabled: !!id,
  });

  return { payments: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Order Bookers by name for the Sales filter and the New Sale select. An Order Booker without view-all
 * gets only themselves back, so the same hook serves every role.
 */
export function useOrderBookers(branchId: string | null, enabled = true) {
  const query = useTenantQuery({
    queryKey: [...SALES_QUERY_KEY, 'order-bookers', branchId],
    queryFn: () => apiFetch<OrderBookerOption[]>(`/sales/order-bookers${branchId ? `?branchId=${branchId}` : ''}`),
    enabled,
    staleTime: 60 * 1000,
  });
  return { orderBookers: query.data ?? [], isLoading: query.isLoading };
}

/** Admin-only: hand a sale to another Order Booker. */
const PENDING_ORDERS_KEY = [...SALES_QUERY_KEY, 'pending-orders'];

/** Each Order Booker with pending orders on `date` (yyyy-mm-dd). */
export function usePendingOrderSummary(date: string, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...PENDING_ORDERS_KEY, 'summary', date, branchId],
    queryFn: () => {
      const params = new URLSearchParams({ date });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<PendingOrderBookerSummary[]>(`/sales/orders/summary?${params}`);
    },
  });
  return { bookers: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** One Order Booker's pending orders on `date`. */
export function usePendingOrders(date: string, orderBookerId: string, branchId: string | null) {
  const query = useTenantQuery({
    queryKey: [...PENDING_ORDERS_KEY, 'list', date, orderBookerId, branchId],
    queryFn: () => {
      const params = new URLSearchParams({ date, orderBookerId });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<PendingOrderRow[]>(`/sales/orders?${params}`);
    },
    enabled: !!orderBookerId,
  });
  return { orders: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** Every pending order of one Order Booker with its lines, fetched only while `enabled` (the preview is open). */
export function usePendingOrdersPreview(
  date: string,
  orderBookerId: string,
  branchId: string | null,
  enabled: boolean,
) {
  const query = useTenantQuery({
    queryKey: [...PENDING_ORDERS_KEY, 'preview', date, orderBookerId, branchId],
    queryFn: () => {
      const params = new URLSearchParams({ date, orderBookerId });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<Sale[]>(`/sales/orders/preview?${params}`);
    },
    enabled: enabled && !!orderBookerId,
  });
  return { sales: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

/** Confirm or reject a selection of pending orders in one request. */
export function useProcessOrders(branchId: string | null) {
  const queryClient = useTenantQueryClient();
  const run = (action: 'confirm' | 'reject') => (saleIds: string[]) =>
    apiFetch<ProcessOrdersResult>(`/sales/orders/${action}`, {
      method: 'POST',
      body: { saleIds, ...(branchId ? { branchId } : {}) } satisfies ProcessOrdersRequest,
    });
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };
  const confirm = useMutation({
    mutationFn: run('confirm'),
    onSuccess: (r) => toast.success(`${r.processed} ${r.processed === 1 ? 'order' : 'orders'} confirmed`),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to confirm orders'),
    onSettled,
  });
  const reject = useMutation({
    mutationFn: run('reject'),
    onSuccess: (r) => toast.success(`${r.processed} ${r.processed === 1 ? 'order' : 'orders'} rejected`),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to reject orders'),
    onSettled,
  });
  return {
    confirmOrders: confirm.mutateAsync,
    rejectOrders: reject.mutateAsync,
    isProcessing: confirm.isPending || reject.isPending,
  };
}

export function useReassignOrderBooker(branchId: string | null) {
  const queryClient = useTenantQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ReassignOrderBookerRequest }) =>
      apiFetch<Sale>(`/sales/${id}/order-booker${branchId ? `?branchId=${branchId}` : ''}`, { method: 'PATCH', body: dto }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: SALES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success(`Invoice ${data.invoiceNumber} now belongs to ${data.orderBookerName}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to reassign Order Booker'),
  });
  return { reassign: mutation.mutateAsync, isReassigning: mutation.isPending };
}
