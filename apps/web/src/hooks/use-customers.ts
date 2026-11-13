'use client';

import { useMutation } from '@tanstack/react-query';
import type { Customer, CreateCustomerRequest, UpdateCustomerRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const CUSTOMERS_QUERY_KEY = ['customers'];

async function fetchCustomers(search?: string, branchId?: string | null): Promise<Customer[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<Customer[]>(`/customers${query}`, {
    headers: branchId ? { 'X-Branch-Id': branchId } : undefined,
  });
}

async function createCustomer(dto: CreateCustomerRequest): Promise<Customer> {
  return apiFetch<Customer>('/customers', { method: 'POST', body: dto });
}

async function updateCustomer(id: string, dto: UpdateCustomerRequest): Promise<Customer> {
  return apiFetch<Customer>(`/customers/${id}`, { method: 'PATCH', body: dto });
}

async function deleteCustomer(id: string): Promise<void> {
  await apiFetch(`/customers/${id}`, { method: 'DELETE' });
}

/** `branchId` lists that branch's customers (create forms with their own Branch field); default follows the top bar. */
export function useCustomers(search?: string, branchId?: string | null) {
  const queryClient = useTenantQueryClient();

  const listQuery = useTenantQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, search, branchId ?? null],
    queryFn: () => fetchCustomers(search, branchId),
    staleTime: 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      invalidate();
      toast.success('Customer created successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create customer'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCustomerRequest }) => updateCustomer(id, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Customer updated successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update customer'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      invalidate();
      toast.success('Customer deleted successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to delete customer'),
  });

  return {
    customers: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateCustomerRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    delete: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
