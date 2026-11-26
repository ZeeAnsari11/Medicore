'use client';

import { keepPreviousData } from '@tanstack/react-query';
import type {
  GeneralLedgerResponse,
  PartyBalancesResponse,
  PartyLedgerResponse,
} from '@medicore/shared-types';
import { apiFetch, apiFetchBlob, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery } from '@/lib/tenant-query';

const KEY = ['accounting', 'ledgers'];

export type PartyKind = 'customers' | 'vendors';

export interface LedgerParams {
  branchId?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface PartyBalancesParams {
  branchId?: string;
  search?: string;
  hasBalance?: boolean;
  /** Period for invoiced / received / returns; balances are as of `to`. Empty = all time. */
  from?: string;
  to?: string;
  sortBy: 'name' | 'balance';
  sortDir: 'asc' | 'desc';
  page: number;
  limit: number;
}

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) q.set(key, String(value));
  }
  return q.toString();
}

export function useGeneralLedger(accountId: string | null, params: LedgerParams) {
  // No account means every account together.
  const query = useTenantQuery({
    queryKey: [...KEY, 'gl', accountId, params],
    queryFn: () => apiFetch<GeneralLedgerResponse>(`/accounting/general-ledger?${toQuery({ accountId: accountId || undefined, ...params })}`),
    placeholderData: keepPreviousData,
  });
  return { ledger: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}

export function usePartyLedger(kind: PartyKind, partyId: string | null, params: LedgerParams) {
  const query = useTenantQuery({
    queryKey: [...KEY, kind, 'ledger', partyId, params],
    queryFn: () => apiFetch<PartyLedgerResponse>(`/accounting/${kind}/${partyId}/ledger?${toQuery({ ...params })}`),
    enabled: !!partyId,
    placeholderData: keepPreviousData,
  });
  return { ledger: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}

export function usePartyBalances(kind: PartyKind, params: PartyBalancesParams, enabled = true) {
  const query = useTenantQuery({
    queryKey: [...KEY, kind, 'balances', params],
    queryFn: () => apiFetch<PartyBalancesResponse>(`/accounting/${kind}/balances?${toQuery({ ...params })}`),
    enabled,
    placeholderData: keepPreviousData,
  });
  return { balances: query.data, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
}

/** Export path = the ledger route plus `/export`; the server decides the file from `format`. */
export function useLedgerExport() {
  const run = async (path: string, format: 'csv' | 'pdf' | 'statement', filename: string) => {
    // Open the tab before awaiting so the browser doesn't block it as a popup.
    const tab = format === 'csv' ? null : window.open('', '_blank');
    try {
      const blob = await apiFetchBlob(`${path}${path.includes('?') ? '&' : '?'}format=${format}`);
      const url = URL.createObjectURL(blob);
      if (format === 'csv') {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else if (tab) {
        tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      tab?.close();
      toast.error(err instanceof ApiError ? err.message : 'Export failed');
    }
  };
  return { exportLedger: run, exportQuery: toQuery };
}
