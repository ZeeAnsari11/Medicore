'use client';

import { useMemo } from 'react';
import {
  useQuery,
  useQueryClient,
  type InvalidateQueryFilters,
  type QueryKey,
  type SetDataOptions,
  type Updater,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useBranchSelection } from '@/lib/branch-selection';

/** Placeholder segment while the user is still loading; queries are disabled until a tenant is known. */
const NO_TENANT = 'no-tenant';

export function useTenantId(): string | null {
  return useAuth().user?.tenantId ?? null;
}

/**
 * Every key becomes [tenantId, ...key, branch:<selection>], so one tenant's (or branch's) cache entries
 * can never be served to another. The branch goes last so prefix invalidation of [tenantId, ...key]
 * still reaches every branch variant.
 */
export const tenantKey = (tenantId: string | null, key: QueryKey, branch?: string | null): QueryKey => [
  tenantId ?? NO_TENANT,
  ...key,
  ...(branch === undefined ? [] : [`branch:${branch ?? 'default'}`]),
];

/** Drop-in for useQuery: tenantId is the first segment of the key and queries wait for the tenant. */
export function useTenantQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData>(
  options: UseQueryOptions<TQueryFnData, TError, TData, QueryKey>,
): UseQueryResult<TData, TError> {
  const tenantId = useTenantId();
  const branch = useBranchSelection();
  return useQuery({
    ...options,
    queryKey: tenantKey(tenantId, options.queryKey, branch),
    enabled: tenantId !== null && (options.enabled ?? true),
  });
}

/** Drop-in for useQueryClient: cache reads/writes/invalidations are automatically tenant-prefixed. */
export function useTenantQueryClient() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const branch = useBranchSelection();
  return useMemo(
    () => ({
      invalidateQueries: (filters: InvalidateQueryFilters & { queryKey: QueryKey }) =>
        queryClient.invalidateQueries({ ...filters, queryKey: tenantKey(tenantId, filters.queryKey) }),
      setQueryData: <T>(key: QueryKey, updater: Updater<T | undefined, T | undefined>, options?: SetDataOptions) =>
        queryClient.setQueryData<T>(tenantKey(tenantId, key, branch), updater, options),
      getQueryData: <T>(key: QueryKey) => queryClient.getQueryData<T>(tenantKey(tenantId, key, branch)),
      clear: () => queryClient.clear(),
    }),
    [queryClient, tenantId, branch],
  );
}
