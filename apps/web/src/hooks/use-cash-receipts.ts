'use client';

import { keepPreviousData, useMutation } from '@tanstack/react-query';
import type {
  CashPaymentResult,
  CashPaymentTransaction,
  CashPaymentTransactionSummary,
  LastCashPaymentTransactionResponse,
  LookupPurchase,
  PaginatedCashPaymentTransactions,
  CashReceiptRequest,
  CashReceiptResult,
  CashReceiptRowError,
  CashTransaction,
  CashTransactionSummary,
  LastCashTransactionResponse,
  LookupInvoice,
  OutstandingParty,
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

/**
 * The sheet works for sales (cash receipt, T-0001) and purchases (bulk purchase receipt / vendor payments, PT-0001).
 * The purchase API speaks vendors; the page speaks customers, so purchase responses are mapped to the same shapes.
 */
export type ReceiptKind = 'sale' | 'purchase';

export const RECEIPT_KIND = {
  sale: {
    root: '/sales/cash-receipts',
    lookup: '/sales/invoices/lookup',
    prefix: 'T-',
    permission: 'cash_receipt',
    queryRoot: 'sales',
  },
  purchase: {
    root: '/purchases/cash-payments',
    lookup: '/purchases/invoices/lookup',
    prefix: 'PT-',
    permission: 'cash_payment',
    queryRoot: 'purchases',
  },
} as const;

const lookupOf = (p: LookupPurchase): LookupInvoice => ({
  id: p.id,
  invoiceNumber: p.invoiceNumber,
  saleDate: p.purchaseDate,
  customerId: p.vendorId,
  customerName: p.vendorName,
  grandTotal: p.grandTotal,
  netTotal: p.netTotal,
  received: p.paid,
  balance: p.balance,
  payable: p.payable,
  customerBalance: p.vendorBalance,
});

const resultOf = (r: CashPaymentResult): CashReceiptResult => ({
  ...r,
  rows: r.rows.map(({ vendorName, ...row }) => ({ ...row, customerName: vendorName })),
});

const transactionOf = (t: CashPaymentTransaction): CashTransaction => ({
  ...t,
  rows: t.rows.map(({ vendorId, vendorName, purchaseDate, vendorBalance, paid, ...row }) => ({
    ...row,
    customerId: vendorId,
    customerName: vendorName,
    saleDate: purchaseDate,
    customerBalance: vendorBalance,
    received: paid,
  })),
});

const summaryOf = (s: CashPaymentTransactionSummary): CashTransactionSummary => {
  const { vendors, ...rest } = s;
  return { ...rest, customers: vendors };
};

const withBranch = (path: string, branchId: string | null) =>
  branchId ? `${path}${path.includes('?') ? '&' : '?'}branchId=${branchId}` : path;

export function useInvoiceLookup(q: string, branchId: string | null, kind: ReceiptKind = 'sale') {
  return useTenantQuery({
    queryKey: [RECEIPT_KIND[kind].queryRoot, 'invoice-lookup', branchId, q],
    queryFn: async () => {
      const path = withBranch(`${RECEIPT_KIND[kind].lookup}?q=${encodeURIComponent(q)}`, branchId);
      return kind === 'purchase' ? (await apiFetch<LookupPurchase[]>(path)).map(lookupOf) : apiFetch<LookupInvoice[]>(path);
    },
    enabled: q.length > 0,
    staleTime: 0,
  });
}

/** Customers (sale) or vendors (purchase) with something left to pay; one quick query that backs the by-customer picker. */
export function useOutstandingParties(branchId: string | null, kind: ReceiptKind = 'sale', enabled = true) {
  return useTenantQuery({
    queryKey: [RECEIPT_KIND[kind].queryRoot, 'outstanding-parties', branchId],
    queryFn: () => apiFetch<OutstandingParty[]>(withBranch(`${RECEIPT_KIND[kind].lookup.replace('/lookup', '/outstanding-parties')}`, branchId)),
    enabled,
    staleTime: 15_000,
  });
}

/** Every invoice of one customer (sale) or vendor (purchase) that still has a balance, oldest first. */
export function usePartyInvoices(partyId: string, branchId: string | null, kind: ReceiptKind = 'sale') {
  return useTenantQuery({
    queryKey: [RECEIPT_KIND[kind].queryRoot, 'party-invoices', branchId, partyId],
    queryFn: async () => {
      const param = kind === 'purchase' ? 'vendorId' : 'customerId';
      const path = withBranch(`${RECEIPT_KIND[kind].lookup}?${param}=${encodeURIComponent(partyId)}`, branchId);
      return kind === 'purchase' ? (await apiFetch<LookupPurchase[]>(path)).map(lookupOf) : apiFetch<LookupInvoice[]>(path);
    },
    enabled: partyId.length > 0,
    staleTime: 0,
  });
}

/** Failing rows from a rejected save (400 with `errors[]`), if the error carries them. */
export function rowErrorsOf(error: unknown): CashReceiptRowError[] {
  const errors = error instanceof ApiError ? (error.body as { errors?: unknown } | undefined)?.errors : undefined;
  return Array.isArray(errors) ? (errors as CashReceiptRowError[]) : [];
}

export function useSaveCashReceipt(kind: ReceiptKind = 'sale') {
  const queryClient = useTenantQueryClient();
  return useMutation({
    mutationFn: async (dto: CashReceiptRequest) => {
      // The sheet's branch is the branch of its invoices.
      const result = await apiFetch<CashReceiptResult | CashPaymentResult>(RECEIPT_KIND[kind].root, {
        method: 'POST',
        body: dto,
      });
      return kind === 'purchase' ? resultOf(result as CashPaymentResult) : (result as CashReceiptResult);
    },
    onSuccess: () => invalidateAfterReceipt(queryClient),
    onError: (error) => {
      if (rowErrorsOf(error).length === 0) {
        toast.error(error instanceof ApiError ? error.message : 'Failed to save');
      }
    },
  });
}

/** Invoices, ledgers, payments, customer balances, dashboard and reports all move when a receipt is saved or edited. */
function invalidateAfterReceipt(queryClient: ReturnType<typeof useTenantQueryClient>) {
  for (const key of ['sales', 'purchases', 'accounting', 'customers', 'vendors', 'dashboard', 'reports']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** `T-0001`, `t-1` and `1` all mean the same transaction; anything else is not a transaction number. */
export function normalizeTransactionNumber(raw: string, kind: ReceiptKind = 'sale'): string | null {
  const m = (kind === 'purchase' ? /^(?:pt-?)?(\d{1,9})$/i : /^(?:t-?)?(\d{1,9})$/i).exec(raw.trim());
  return m ? `${RECEIPT_KIND[kind].prefix}${m[1].padStart(4, '0')}` : null;
}

/** `GET /sales/cash-receipts/by-number/:number`: a saved transaction with its invoices as they are now. */
export function useLoadCashTransaction(kind: ReceiptKind = 'sale') {
  return useMutation({
    mutationFn: async (number: string) => {
      const t = await apiFetch<CashTransaction | CashPaymentTransaction>(
        `${RECEIPT_KIND[kind].root}/by-number/${encodeURIComponent(number)}`,
      );
      return kind === 'purchase' ? transactionOf(t as CashPaymentTransaction) : (t as CashTransaction);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to load the transaction'),
  });
}

/** `PATCH /sales/cash-receipts/by-number/:number`: edits the transaction in place; 409 means someone else changed it first. */
export function useUpdateCashTransaction(kind: ReceiptKind = 'sale') {
  const queryClient = useTenantQueryClient();
  return useMutation({
    mutationFn: async ({ number, dto }: { number: string; dto: UpdateCashTransactionRequest }) => {
      const t = await apiFetch<CashTransaction | CashPaymentTransaction>(
        `${RECEIPT_KIND[kind].root}/by-number/${encodeURIComponent(number)}`,
        { method: 'PATCH', body: dto },
      );
      return kind === 'purchase' ? transactionOf(t as CashPaymentTransaction) : (t as CashTransaction);
    },
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
export function useCashTransactionsPage(p: CashTransactionListParams, enabled = true, kind: ReceiptKind = 'sale') {
  const query = useTenantQuery<PaginatedCashTransactions>({
    queryKey: [RECEIPT_KIND[kind].queryRoot, 'cash-transactions', p],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
      if (p.branchId) params.set('branchId', p.branchId);
      if (p.q) params.set('q', p.q);
      if (p.startDate) params.set('startDate', p.startDate);
      if (p.endDate) params.set('endDate', p.endDate);
      if (kind === 'sale') return apiFetch<PaginatedCashTransactions>(`${RECEIPT_KIND.sale.root}?${params}`);
      const page = await apiFetch<PaginatedCashPaymentTransactions>(`${RECEIPT_KIND.purchase.root}?${params}`);
      return { ...page, items: page.items.map(summaryOf) };
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
export function useLastCashTransaction(branchId: string | null, kind: ReceiptKind = 'sale') {
  const query = useTenantQuery<LastCashTransactionResponse>({
    queryKey: [RECEIPT_KIND[kind].queryRoot, 'cash-transactions', 'last', branchId],
    queryFn: async () => {
      const path = withBranch(`${RECEIPT_KIND[kind].root}/last`, branchId);
      if (kind === 'sale') return apiFetch<LastCashTransactionResponse>(path);
      const last = await apiFetch<LastCashPaymentTransactionResponse>(path);
      return { transaction: last.transaction ? summaryOf(last.transaction) : null };
    },
    staleTime: 0,
  });
  return query.data?.transaction ?? null;
}
