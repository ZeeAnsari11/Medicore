'use client';

import type {
  TrialBalanceResponse,
  ProfitLossResponse,
  BalanceSheetResponse,
  AccountingOverviewResponse,
} from '@medicore/shared-types';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

const KEY = ['accounting', 'reports'];

export function useAccountingOverview(branchId: string | null, enabled = true) {
  const query = useTenantQuery({
    enabled,
    queryKey: [...KEY, 'overview', branchId],
    queryFn: () => {
      const params = branchId ? `?branchId=${branchId}` : '';
      return apiFetch<AccountingOverviewResponse>(`/accounting/reports/overview${params}`);
    },
    staleTime: 30 * 1000,
  });
  return { overview: query.data, isLoading: query.isLoading, error: query.error };
}

export function useTrialBalance(branchId: string | null, asOfDate?: string) {
  const query = useTenantQuery({
    queryKey: [...KEY, 'trial-balance', branchId, asOfDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (asOfDate) params.set('asOfDate', asOfDate);
      const q = params.toString();
      return apiFetch<TrialBalanceResponse>(`/accounting/reports/trial-balance${q ? `?${q}` : ''}`);
    },
  });
  return { trialBalance: query.data, isLoading: query.isLoading, error: query.error };
}

export function useProfitLoss(branchId: string | null, startDate?: string, endDate?: string) {
  const query = useTenantQuery({
    queryKey: [...KEY, 'profit-loss', branchId, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      return apiFetch<ProfitLossResponse>(`/accounting/reports/profit-loss${q ? `?${q}` : ''}`);
    },
  });
  return { profitLoss: query.data, isLoading: query.isLoading, error: query.error };
}

export function useBalanceSheet(branchId: string | null, asOfDate?: string) {
  const query = useTenantQuery({
    queryKey: [...KEY, 'balance-sheet', branchId, asOfDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (asOfDate) params.set('asOfDate', asOfDate);
      const q = params.toString();
      return apiFetch<BalanceSheetResponse>(`/accounting/reports/balance-sheet${q ? `?${q}` : ''}`);
    },
  });
  return { balanceSheet: query.data, isLoading: query.isLoading, error: query.error };
}
