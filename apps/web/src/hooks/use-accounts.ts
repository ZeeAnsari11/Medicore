'use client';

import { useMutation } from '@tanstack/react-query';
import type { Account, CreateAccountRequest, UpdateAccountRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const ACCOUNTS_QUERY_KEY = ['accounting', 'accounts'];

async function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/accounting/accounts');
}

async function createAccount(dto: CreateAccountRequest): Promise<Account> {
  return apiFetch<Account>('/accounting/accounts', { method: 'POST', body: dto });
}

async function updateAccount(id: string, dto: UpdateAccountRequest): Promise<Account> {
  return apiFetch<Account>(`/accounting/accounts/${id}`, { method: 'PATCH', body: dto });
}

async function deleteAccount(id: string): Promise<void> {
  await apiFetch(`/accounting/accounts/${id}`, { method: 'DELETE' });
}

export function useAccounts() {
  const queryClient = useTenantQueryClient();

  const query = useTenantQuery({ queryKey: ACCOUNTS_QUERY_KEY, queryFn: fetchAccounts, staleTime: 60 * 1000 });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      invalidate();
      toast.success('Account created');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create account'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAccountRequest }) => updateAccount(id, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Account updated');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update account'),
  });

  const removeMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      invalidate();
      toast.success('Account removed');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to remove account'),
  });

  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateAccountRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}
