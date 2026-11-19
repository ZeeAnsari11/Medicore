'use client';

import { keepPreviousData, useMutation } from '@tanstack/react-query';
import type {
  CashReceiptRequest,
  CashReceiptResult,
  CashReceiptRowError,
  CashTransaction,
  LastCashTransactionResponse,
  LookupInvoice,
  PaginatedCashTransactions,
  UpdateCashTransactionRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export type {
  CashReceiptResult,
  CashReceiptRequest,
  CashReceiptRowError,
  CashReceiptRowInput,
  CashTransaction,
  CashTransactionRow,
  CashTransactionSummary,
  LookupInvoice,
  PaginatedCashTransactions,
  UpdateCashTransactionRequest,
} from '@medicore/shared-types';

const withBranch = (path: string, branchId: string | null) =>
  branchId ? `${path}${path.includes('?') ? '&' : '?'}branchId=${branchId}` : path;

export function useInvoiceLookup(q: string, branchId: string | null) {
  return useTenantQuery({
    queryKey: ['sales', 'invoice-lookup', branchId, q],
    queryFn: () =>
      apiFetch<LookupInvoice[]>(withBranch(`/sales/invoices/lookup?q=${encodeURIComponent(q)}`, branchId)),
    enabled: q.length > 0,
    staleTime: 0,
  });
}

/** Failing rows from a rejected save (400 with `errors[]`), if the error carries them. */
export function rowErrorsOf(error: unknown): CashReceiptRowError[] {
  const errors = error instanceof ApiError ? (error.body as { errors?: unknown } | undefined)?.errors : undefined;
  return Array.isArray(errors) ? (errors as CashReceiptRowError[]) : [];
}

export function useSaveCashReceipt() {
  const queryClient = useTenantQueryClient();
  return useMutation({
    mutationFn: (dto: CashReceiptRequest) =>
      apiFetch<CashReceiptResult>('/sales/cash-receipts', {
        method: 'POST',
        body: dto, // the sheet's branch is the branch of its invoices
      }),
    onSuccess: () => invalidateAfterReceipt(queryClient),
    onError: (error) => {
      if (rowErrorsOf(error).length === 0) {
        toast.error(error instanceof ApiError ? error.message : 'Failed to save cash receipt');
      }
    },
  });
}

/** Invoices, ledgers, payments, customer balances, dashboard and reports all move when a receipt is saved or edited. */
function invalidateAfterReceipt(queryClient: ReturnType<typeof useTenantQueryClient>) {
  for (const key of ['sales', 'accounting', 'customers', 'dashboard', 'reports']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** `T-0001`, `t-1` and `1` all mean the same transaction; anything else is not a transaction number. */
export function normalizeTransactionNumber(raw: string): string | null {
  const m = /^(?:t-?)?(\d{1,9})$/i.exec(raw.trim());
  return m ? `T-${m[1].padStart(4, '0')}` : null;
}

/** `GET /sales/cash-receipts/by-number/:number`: a saved transaction with its invoices as they are now. */
export function useLoadCashTransaction() {
  return useMutation({
    mutationFn: (number: string) =>
      apiFetch<CashTransaction>(`/sales/cash-receipts/by-number/${encodeURIComponent(number)}`),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to load the transaction'),
  });
}

/** `PATCH /sales/cash-receipts/by-number/:number`: edits the transaction in place; 409 means someone else changed it first. */
export function useUpdateCashTransaction() {
  const queryClient = useTenantQueryClient();
  return useMutation({
    mutationFn: ({ number, dto }: { number: string; dto: UpdateCashTransactionRequest }) =>
      apiFetch<CashTransaction>(`/sales/cash-receipts/by-number/${encodeURIComponent(number)}`, {
        method: 'PATCH',
        body: dto,
      }),
    onSuccess: () => invalidateAfterReceipt(queryClient),
    onError: (error) => {
      if (rowErrorsOf(error).length === 0) {
        toast.error(error instanceof ApiError ? error.message : 'Failed to save edits');
      }
    },
  });
}

export interface CashTransactionListParams {
  branchId: string | null;
  q?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}

/** `GET /sales/cash-receipts`: saved transactions, newest first, filtered and paged on the server. */
export function useCashTransactionsPage(p: CashTransactionListParams, enabled = true) {
  const query = useTenantQuery<PaginatedCashTransactions>({
    queryKey: ['sales', 'cash-transactions', p],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
      if (p.branchId) params.set('branchId', p.branchId);
      if (p.q) params.set('q', p.q);
      if (p.startDate) params.set('startDate', p.startDate);
      if (p.endDate) params.set('endDate', p.endDate);
      return apiFetch<PaginatedCashTransactions>(`/sales/cash-receipts?${params}`);
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  return {
    transactions: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/** `GET /sales/cash-receipts/last`: my most recently created or edited transaction, to prefill the Transaction # box. */
export function useLastCashTransaction(branchId: string | null) {
  const query = useTenantQuery<LastCashTransactionResponse>({
    queryKey: ['sales', 'cash-transactions', 'last', branchId],
    queryFn: () => apiFetch<LastCashTransactionResponse>(withBranch('/sales/cash-receipts/last', branchId)),
    staleTime: 0,
  });
  return query.data?.transaction ?? null;
}
