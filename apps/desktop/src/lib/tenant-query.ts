
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

/** Placeholder segment while the user is still loading; queries are disabled until a tenant is known. */
const NO_TENANT = 'no-tenant';

export function useTenantId(): string | null {
  return useAuth().user?.tenantId ?? null;
}

/** Every key becomes [tenantId, ...key], so one tenant's cache entries can never be served to another. */
export const tenantKey = (tenantId: string | null, key: QueryKey): QueryKey => [tenantId ?? NO_TENANT, ...key];

/** Drop-in for useQuery: tenantId is the first segment of the key and queries wait for the tenant. */
export function useTenantQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData>(
  options: UseQueryOptions<TQueryFnData, TError, TData, QueryKey>,
): UseQueryResult<TData, TError> {
  const tenantId = useTenantId();
  return useQuery({
    ...options,
    queryKey: tenantKey(tenantId, options.queryKey),
    enabled: tenantId !== null && (options.enabled ?? true),
  });
}

/** Drop-in for useQueryClient: cache reads/writes/invalidations are automatically tenant-prefixed. */
export function useTenantQueryClient() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMemo(
    () => ({
      invalidateQueries: (filters: InvalidateQueryFilters & { queryKey: QueryKey }) =>
        queryClient.invalidateQueries({ ...filters, queryKey: tenantKey(tenantId, filters.queryKey) }),
      setQueryData: <T>(key: QueryKey, updater: Updater<T | undefined, T | undefined>, options?: SetDataOptions) =>
        queryClient.setQueryData<T>(tenantKey(tenantId, key), updater, options),
      getQueryData: <T>(key: QueryKey) => queryClient.getQueryData<T>(tenantKey(tenantId, key)),
      clear: () => queryClient.clear(),
    }),
    [queryClient, tenantId],
  );
}
