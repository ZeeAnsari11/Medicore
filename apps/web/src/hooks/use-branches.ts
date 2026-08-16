'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Branch,
  CreateBranchRequest,
  UpdateBranchRequest,
  UpdateBranchStatusRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const BRANCHES_QUERY_KEY = ['branches'];

async function fetchBranches(): Promise<Branch[]> {
  return apiFetch<Branch[]>('/branches');
}

async function createBranch(dto: CreateBranchRequest): Promise<Branch> {
  return apiFetch<Branch>('/branches', { method: 'POST', body: dto });
}

async function updateBranch(id: string, dto: UpdateBranchRequest): Promise<Branch> {
  return apiFetch<Branch>(`/branches/${id}`, { method: 'PATCH', body: dto });
}

async function setBranchStatus(id: string, dto: UpdateBranchStatusRequest): Promise<Branch> {
  return apiFetch<Branch>(`/branches/${id}/status`, { method: 'PATCH', body: dto });
}

async function deleteBranch(id: string): Promise<void> {
  await apiFetch(`/branches/${id}`, { method: 'DELETE' });
}

export function useBranches() {
  const queryClient = useQueryClient();

  const branchesQuery = useQuery({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: fetchBranches,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createBranch,
    onSuccess: (data) => {
      queryClient.setQueryData(BRANCHES_QUERY_KEY, (old: Branch[] | undefined) => [...(old ?? []), data]);
      toast.success('Branch created successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create branch'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateBranchRequest }) => updateBranch(id, dto),
    onSuccess: (data) => {
      queryClient.setQueryData(BRANCHES_QUERY_KEY, (old: Branch[] | undefined) =>
        old ? old.map((b) => (b.id === data.id ? data : b)) : [data],
      );
      toast.success('Branch updated successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update branch'),
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setBranchStatus(id, { isActive }),
    onSuccess: (data) => {
      queryClient.setQueryData(BRANCHES_QUERY_KEY, (old: Branch[] | undefined) =>
        old ? old.map((b) => (b.id === data.id ? data : b)) : [data],
      );
      toast.success(`Branch ${data.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update branch status'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBranch,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(BRANCHES_QUERY_KEY, (old: Branch[] | undefined) =>
        old ? old.filter((b) => b.id !== id) : [],
      );
      toast.success('Branch deleted successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to delete branch'),
  });

  return {
    branches: branchesQuery.data ?? [],
    isLoading: branchesQuery.isLoading,
    error: branchesQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateBranchRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: (id: string, isActive: boolean) => setStatusMutation.mutateAsync({ id, isActive }),
    isSettingStatus: setStatusMutation.isPending,
    delete: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
