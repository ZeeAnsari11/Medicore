'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CreateCategoryRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const CATEGORIES_QUERY_KEY = ['categories'];

async function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories');
}

async function createCategory(dto: CreateCategoryRequest): Promise<Category> {
  return apiFetch<Category>('/categories', { method: 'POST', body: dto });
}

export function useCategories() {
  const queryClient = useQueryClient();

  const categoriesQuery = useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: (data) => {
      queryClient.setQueryData(CATEGORIES_QUERY_KEY, (old: Category[] | undefined) => [...(old ?? []), data]);
      toast.success('Category created successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create category'),
  });

  return {
    categories: categoriesQuery.data ?? [],
    isLoading: categoriesQuery.isLoading,
    error: categoriesQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
  };
}
