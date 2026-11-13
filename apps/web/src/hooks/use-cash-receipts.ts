'use client';

import { useMutation } from '@tanstack/react-query';
import { PaymentMethod } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export interface LookupInvoice {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  customerId: string;
  customerName: string;
  grandTotal: number;
  netTotal: number;
  received: number;
  balance: number;
  payable: boolean;
  customerBalance: number;
}

export interface CashReceiptRowInput {
  invoiceId: string;
  amount: number;
  method?: PaymentMethod;
  reference?: string;
}

export interface CashReceiptRequest {
  batchId: string;
  date: string;
  method: PaymentMethod;
  rows: CashReceiptRowInput[];
}

export interface CashReceiptResult {
  id: string;
  voucherNumber: string;
  count: number;
  total: number;
  rows: Array<{ invoiceId: string; invoiceNumber: string; customerName: string; amount: number }>;
}

export interface CashReceiptRowError {
  invoiceId: string;
  reason: string;
}

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error) => {
      if (rowErrorsOf(error).length === 0) {
        toast.error(error instanceof ApiError ? error.message : 'Failed to save cash receipt');
      }
    },
  });
}
