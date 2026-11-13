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
