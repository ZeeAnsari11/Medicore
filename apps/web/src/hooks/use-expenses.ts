'use client';

import { useMutation } from '@tanstack/react-query';
import type { Expense, CreateExpenseRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const EXPENSES_QUERY_KEY = ['accounting', 'expenses'];

async function fetchExpenses(branchId: string | null): Promise<Expense[]> {
  const query = branchId ? `?branchId=${branchId}` : '';
  return apiFetch<Expense[]>(`/accounting/expenses${query}`);
}

export interface ExpenseLedgerParams {
  branchId: string | null;
  from?: string;
  to?: string;
  categoryId?: string;
  subCategoryId?: string;
  paymentMethod?: string;
}

/** Query string of the Expense Sheet PDF: the filters the Expenses page applies (or one category / sub-category). */
export function expenseLedgerQuery({ branchId, from, to, categoryId, subCategoryId, paymentMethod }: ExpenseLedgerParams): string {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (categoryId) params.set('categoryId', categoryId);
  if (subCategoryId) params.set('subCategoryId', subCategoryId);
  if (paymentMethod) params.set('paymentMethod', paymentMethod);
  return params.toString();
}

async function createExpense(dto: CreateExpenseRequest): Promise<Expense> {
  return apiFetch<Expense>('/accounting/expenses', { method: 'POST', body: dto });
}

export function useExpenses(branchId: string | null) {
  const queryClient = useTenantQueryClient();

  const query = useTenantQuery({
    queryKey: [...EXPENSES_QUERY_KEY, branchId],
    queryFn: () => fetchExpenses(branchId),
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
      toast.success('Expense recorded');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to record expense'),
  });

  return {
    expenses: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
  };
}
