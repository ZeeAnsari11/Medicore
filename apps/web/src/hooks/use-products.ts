'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  UpdateProductStatusRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const PRODUCTS_QUERY_KEY = ['products'];

export interface ProductFilters {
  /** Branch whose products to list, for pickers inside a branch-owned form; defaults to the top-bar branch. */
  branchId?: string | null;
  manufacturerId?: string;
  categoryId?: string;
  search?: string;
}

async function fetchProducts(filters: ProductFilters): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.manufacturerId) params.set('manufacturerId', filters.manufacturerId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.search) params.set('search', filters.search);
  const query = params.toString();
  return apiFetch<Product[]>(`/products${query ? `?${query}` : ''}`, {
    headers: filters.branchId ? { 'X-Branch-Id': filters.branchId } : undefined,
  });
}

async function createProduct(dto: CreateProductRequest): Promise<Product> {
  return apiFetch<Product>('/products', { method: 'POST', body: dto });
}

async function updateProduct(id: string, dto: UpdateProductRequest): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`, { method: 'PATCH', body: dto });
}

async function setProductStatus(id: string, dto: UpdateProductStatusRequest): Promise<Product> {
  return apiFetch<Product>(`/products/${id}/status`, { method: 'PATCH', body: dto });
}

export function useProducts(filters: ProductFilters = {}) {
  const queryClient = useTenantQueryClient();

  const productsQuery = useTenantQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, filters],
    queryFn: () => fetchProducts(filters),
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      invalidate();
      toast.success('Product created successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to create product'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateProductRequest }) => updateProduct(id, dto),
    onSuccess: () => {
      invalidate();
      toast.success('Product updated successfully');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update product'),
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateProductStatusRequest['status'] }) =>
      setProductStatus(id, { status }),
    onSuccess: () => {
      invalidate();
      toast.success('Product status updated');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update status'),
  });

  return {
    products: productsQuery.data ?? [],
    isLoading: productsQuery.isLoading,
    error: productsQuery.error,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateProductRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: (id: string, status: UpdateProductStatusRequest['status']) =>
      setStatusMutation.mutateAsync({ id, status }),
    isSettingStatus: setStatusMutation.isPending,
  };
}
