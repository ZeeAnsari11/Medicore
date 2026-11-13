'use client';

import { useMutation } from '@tanstack/react-query';
import type { CreatePlanRequest, Plan, PlanStatus, UpdatePlanRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const PLATFORM_PLANS_QUERY_KEY = ['platform', 'plans'];

async function fetchPlans(): Promise<Plan[]> {
  return apiFetch<Plan[]>('/platform/plans');
}

async function createPlan(dto: CreatePlanRequest): Promise<Plan> {
  return apiFetch<Plan>('/platform/plans', { method: 'POST', body: dto });
}

async function updatePlan(id: string, dto: UpdatePlanRequest): Promise<Plan> {
  return apiFetch<Plan>(`/platform/plans/${id}`, { method: 'PATCH', body: dto });
}

async function setPlanStatus(id: string, status: PlanStatus): Promise<Plan> {
  return apiFetch<Plan>(`/platform/plans/${id}/status`, { method: 'PATCH', body: { status } });
}

export function usePlatformPlans() {
  const queryClient = useTenantQueryClient();

  const plansQuery = useTenantQuery({
    queryKey: PLATFORM_PLANS_QUERY_KEY,
    queryFn: fetchPlans,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createPlan,
    onSuccess: (plan) => {
      queryClient.setQueryData(PLATFORM_PLANS_QUERY_KEY, (old: Plan[] | undefined) => [
        ...(old ?? []),
        plan,
      ]);
      toast.success('Plan created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to create plan');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePlanRequest }) => updatePlan(id, dto),
    onSuccess: (plan) => {
      queryClient.setQueryData(PLATFORM_PLANS_QUERY_KEY, (old: Plan[] | undefined) =>
        old ? old.map((p) => (p.id === plan.id ? plan : p)) : [plan],
      );
      toast.success('Plan updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update plan');
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PlanStatus }) => setPlanStatus(id, status),
    onSuccess: (plan) => {
      queryClient.setQueryData(PLATFORM_PLANS_QUERY_KEY, (old: Plan[] | undefined) =>
        old ? old.map((p) => (p.id === plan.id ? plan : p)) : [plan],
      );
      toast.success(`Plan ${plan.status.toLowerCase()}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update plan status');
    },
  });

  return {
    plans: plansQuery.data ?? [],
    isLoading: plansQuery.isLoading,
    error: plansQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    update: (id: string, dto: UpdatePlanRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    setStatus: (id: string, status: PlanStatus) => setStatusMutation.mutateAsync({ id, status }),
    isSettingStatus: setStatusMutation.isPending,
  };
}
