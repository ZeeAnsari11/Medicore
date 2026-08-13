'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Subscription, SubscriptionStatus, SubscriptionWithDetails } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const PLATFORM_SUBSCRIPTIONS_QUERY_KEY = ['platform', 'subscriptions'];

async function fetchSubscriptions(): Promise<SubscriptionWithDetails[]> {
  return apiFetch<SubscriptionWithDetails[]>('/platform/subscriptions');
}

async function assignPlan(tenantId: string, planId: string) {
  return apiFetch<Subscription>(`/platform/subscriptions/${tenantId}/plan`, {
    method: 'PATCH',
    body: { planId },
  });
}

async function setStatus(tenantId: string, status: SubscriptionStatus) {
  return apiFetch<Subscription>(`/platform/subscriptions/${tenantId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function usePlatformSubscriptions() {
  const queryClient = useQueryClient();

  const subscriptionsQuery = useQuery({
    queryKey: PLATFORM_SUBSCRIPTIONS_QUERY_KEY,
    queryFn: fetchSubscriptions,
    staleTime: 5 * 60 * 1000,
  });

  const assignPlanMutation = useMutation({
    mutationFn: ({ tenantId, planId }: { tenantId: string; planId: string }) =>
      assignPlan(tenantId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_SUBSCRIPTIONS_QUERY_KEY });
      toast.success('Plan assigned successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to assign plan');
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ tenantId, status }: { tenantId: string; status: SubscriptionStatus }) =>
      setStatus(tenantId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_SUBSCRIPTIONS_QUERY_KEY });
      toast.success('Subscription status updated');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update subscription status');
    },
  });

  return {
    subscriptions: subscriptionsQuery.data ?? [],
    isLoading: subscriptionsQuery.isLoading,
    error: subscriptionsQuery.error,
    assignPlan: (tenantId: string, planId: string) =>
      assignPlanMutation.mutateAsync({ tenantId, planId }),
    isAssigningPlan: assignPlanMutation.isPending,
    setStatus: (tenantId: string, status: SubscriptionStatus) =>
      setStatusMutation.mutateAsync({ tenantId, status }),
    isSettingStatus: setStatusMutation.isPending,
  };
}
