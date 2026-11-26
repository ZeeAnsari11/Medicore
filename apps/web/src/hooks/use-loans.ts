'use client';

import { useMutation } from '@tanstack/react-query';
import type { Loan, CreateLoanRequest, CreateLoanRepaymentRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const LOANS_QUERY_KEY = ['accounting', 'loans'];

export function useLoans(branchId: string | null) {
  const queryClient = useTenantQueryClient();
  const query = useTenantQuery({
    queryKey: [...LOANS_QUERY_KEY, branchId],
    queryFn: () => apiFetch<Loan[]>(`/accounting/loans${branchId ? `?branchId=${branchId}` : ''}`),
    staleTime: 30 * 1000,
  });
  // A loan moves cash, the balance sheet and the cash flow, so those are refreshed too.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: LOANS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
  };
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : 'Something went wrong');

  const create = useMutation({
    mutationFn: (dto: CreateLoanRequest) => apiFetch<Loan>('/accounting/loans', { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidate();
      toast.success('Loan recorded');
    },
    onError,
  });
  const repay = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CreateLoanRepaymentRequest }) =>
      apiFetch<Loan>(`/accounting/loans/${id}/repayments`, { method: 'POST', body: dto }),
    onSuccess: () => {
      invalidate();
      toast.success('Repayment recorded');
    },
    onError,
  });

  return { loans: query.data ?? [], isLoading: query.isLoading, error: query.error, create, repay };
}
