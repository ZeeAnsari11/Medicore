'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  JournalEntry,
  CreateManualJournalEntryRequest,
  CreateOpeningBalanceRequest,
  JournalEntrySourceType,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const JOURNAL_ENTRIES_QUERY_KEY = ['accounting', 'journal-entries'];

async function fetchJournalEntries(branchId: string | null, sourceType?: JournalEntrySourceType): Promise<JournalEntry[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (sourceType) params.set('sourceType', sourceType);
  const query = params.toString();
  return apiFetch<JournalEntry[]>(`/accounting/journal-entries${query ? `?${query}` : ''}`);
}

async function createManualEntry(dto: CreateManualJournalEntryRequest): Promise<JournalEntry> {
  return apiFetch<JournalEntry>('/accounting/journal-entries', { method: 'POST', body: dto });
}

async function createOpeningBalance(dto: CreateOpeningBalanceRequest): Promise<JournalEntry> {
  return apiFetch<JournalEntry>('/accounting/opening-balances', { method: 'POST', body: dto });
}

export function useJournalEntries(branchId: string | null, sourceType?: JournalEntrySourceType) {
  const queryClient = useTenantQueryClient();

  const query = useTenantQuery({
    queryKey: [...JOURNAL_ENTRIES_QUERY_KEY, branchId, sourceType],
    queryFn: () => fetchJournalEntries(branchId, sourceType),
    staleTime: 30 * 1000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: JOURNAL_ENTRIES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
  };

  const createMutation = useMutation({
    mutationFn: createManualEntry,
    onSuccess: () => {
      invalidate();
      toast.success('Journal entry posted');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to post journal entry'),
  });

  const openingBalanceMutation = useMutation({
    mutationFn: createOpeningBalance,
    onSuccess: () => {
      invalidate();
      toast.success('Opening balance posted');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to post opening balance'),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    createOpeningBalance: openingBalanceMutation.mutateAsync,
    isCreatingOpeningBalance: openingBalanceMutation.isPending,
    openingBalanceError: openingBalanceMutation.error,
  };
}
