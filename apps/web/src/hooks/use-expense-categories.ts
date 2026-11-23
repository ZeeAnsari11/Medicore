'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  CreateExpenseCategoryRequest,
  ExpenseCategory,
  UpdateExpenseCategoryRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const EXPENSE_CATEGORIES_QUERY_KEY = ['accounting', 'expense-categories'];

/** Main expense categories with their sub-categories; spend figures follow `branchId` when given. */
export function useExpenseCategories(branchId: string | null = null) {
  const queryClient = useTenantQueryClient();

  const query = useTenantQuery({
    queryKey: [...EXPENSE_CATEGORIES_QUERY_KEY, branchId],
    queryFn: () =>
      apiFetch<ExpenseCategory[]>(
        `/accounting/expense-categories${branchId ? `?branchId=${branchId}` : ''}`,
      ),
    staleTime: 30 * 1000,
  });

  // A new main category also creates its expense account, and renames follow into the chart and the P&L.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['accounting'] });
  const onError = (fallback: string) => (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : fallback);

  const createMutation = useMutation({
    mutationFn: (dto: CreateExpenseCategoryRequest) =>
      apiFetch<{ id: string; name: string; parentId: string | null }>(
        '/accounting/expense-categories',
        { method: 'POST', body: dto },
      ),
    onSuccess: (created) => {
      invalidate();
      toast.success(`${created.parentId ? 'Sub-category' : 'Category'} "${created.name}" created`);
    },
    onError: onError('Failed to create category'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...dto }: UpdateExpenseCategoryRequest & { id: string }) =>
      apiFetch(`/accounting/expense-categories/${id}`, { method: 'PATCH', body: dto }),
    onSuccess: () => {
      invalidate();
      toast.success('Category updated');
    },
    onError: onError('Failed to update category'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/accounting/expense-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast.success('Category deleted');
    },
    onError: onError('Failed to delete category'),
  });

  return {
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}
