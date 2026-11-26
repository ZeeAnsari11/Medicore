'use client';

import type {
  ProfitLossResponse,
  ProfitBreakdownResponse,
  ProfitStatement,
  ProfitGroupBy,
  BalanceSheetResponse,
  AccountingOverviewResponse,
  CashFlowResponse,
} from '@medicore/shared-types';
import { keepPreviousData } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useTenantQuery } from '@/lib/tenant-query';

const KEY = ['accounting', 'reports'];

export function useAccountingOverview(branchId: string | null, enabled = true, startDate?: string, endDate?: string) {
  const query = useTenantQuery({
    enabled,
    queryKey: [...KEY, 'overview', branchId, startDate, endDate],
    queryFn: () => {
      const q = new URLSearchParams();
      if (branchId) q.set('branchId', branchId);
      if (startDate) q.set('startDate', startDate);
      if (endDate) q.set('endDate', endDate);
      const params = q.size ? `?${q}` : '';
      return apiFetch<AccountingOverviewResponse>(`/accounting/reports/overview${params}`);
    },
    staleTime: 30 * 1000,
  });
  return { overview: query.data, isLoading: query.isLoading, error: query.error };
}

export function useCashFlow(branchId: string | null, startDate?: string, endDate?: string) {
  const query = useTenantQuery({
    queryKey: [...KEY, 'cash-flow', branchId, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (branchId) params.set('branchId', branchId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const q = params.toString();
      return apiFetch<CashFlowResponse>(`/accounting/reports/cash-flow${q ? `?${q}` : ''}`);
    },
    placeholderData: keepPreviousData,
  });
  return { cashFlow: query.data, isLoading: query.isLoading, error: query.error };
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

/** Gross profit for the period grouped by one dimension (customer, vendor, ...). Only fetched while a dimension is chosen. */
export function useProfitBreakdown(
  branchId: string | null,
  groupBy: ProfitGroupBy | null,
  from: string,
  to: string,
) {
  const query = useTenantQuery({
    enabled: groupBy !== null,
    queryKey: [...KEY, 'profit-breakdown', branchId, groupBy, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ groupBy: groupBy as string, from, to });
      if (branchId) params.set('branchId', branchId);
      return apiFetch<ProfitBreakdownResponse>(`/reports/profit-breakdown?${params.toString()}`);
    },
  });
  return { breakdown: query.data, isLoading: query.isLoading, error: query.error };
}

export interface ProfitStatementParams {
  branchId: string | null;
  from: string;
  to: string;
  manufacturerId?: string;
  excludeReturns: boolean;
}

/** Query string for the stock-based Profit & Loss Statement (JSON and PDF share it). */
export function profitStatementQuery({ branchId, from, to, manufacturerId, excludeReturns }: ProfitStatementParams): string {
  const params = new URLSearchParams({ from, to });
  if (branchId) params.set('branchId', branchId);
  if (manufacturerId) params.set('manufacturerId', manufacturerId);
  if (excludeReturns) params.set('excludeReturns', 'true');
  return params.toString();
}

export function useProfitStatement(params: ProfitStatementParams, enabled: boolean) {
  const query = useTenantQuery({
    enabled,
    queryKey: [...KEY, 'profit-statement', params],
    queryFn: () => apiFetch<ProfitStatement>(`/reports/profit-statement?${profitStatementQuery(params)}`),
  });
  return { statement: query.data, isLoading: query.isLoading, error: query.error };
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
