'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Customer, CreateCustomerRequest, UpdateCustomerRequest } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const CUSTOMERS_QUERY_KEY = ['customers'];

async function fetchCustomers(search?: string): Promise<Customer[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<Customer[]>(`/customers${query}`);
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

export function useCustomers(search?: string) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: [...CUSTOMERS_QUERY_KEY, search],
    queryFn: () => fetchCustomers(search),
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
