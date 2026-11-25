'use client';

import type { Account } from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

export const ACCOUNTS_QUERY_KEY = ['accounting', 'accounts'];

async function fetchAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/accounting/accounts');
}

/** The tenant's accounts, for the pickers on payments, expenses, journal entries and the general ledger. */
export function useAccounts() {
  const query = useTenantQuery({ queryKey: ACCOUNTS_QUERY_KEY, queryFn: fetchAccounts, staleTime: 60 * 1000 });
  return {
    accounts: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
