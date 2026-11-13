'use client';

import { useMutation } from '@tanstack/react-query';
import type {
  VendorProduct,
  VendorProductSearchResult,
  ProductVendorSummary,
  CreateVendorProductRequest,
  UpdateVendorProductRequest,
} from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';
import { useTenantQuery, useTenantQueryClient } from '@/lib/tenant-query';

export const VENDOR_PRODUCTS_QUERY_KEY = ['vendor-products'];

async function fetchVendorProductsForProduct(productId: string): Promise<VendorProduct[]> {
  return apiFetch<VendorProduct[]>(`/vendor-products?productId=${productId}`);
}

async function fetchVendorProductsForVendor(vendorId: string): Promise<VendorProduct[]> {
  return apiFetch<VendorProduct[]>(`/vendor-products?vendorId=${vendorId}`);
}

async function searchVendorsByProduct(term: string, includeInactive: boolean): Promise<VendorProductSearchResult[]> {
  const params = new URLSearchParams({ product: term });
  if (includeInactive) params.set('includeInactive', 'true');
  return apiFetch<VendorProductSearchResult[]>(`/vendor-products/search?${params.toString()}`);
}

async function createVendorProduct(dto: CreateVendorProductRequest): Promise<VendorProduct> {
  return apiFetch<VendorProduct>('/vendor-products', { method: 'POST', body: dto });
}

async function updateVendorProduct(id: string, dto: UpdateVendorProductRequest): Promise<VendorProduct> {
  return apiFetch<VendorProduct>(`/vendor-products/${id}`, { method: 'PATCH', body: dto });
}

async function deleteVendorProduct(id: string): Promise<void> {
  await apiFetch(`/vendor-products/${id}`, { method: 'DELETE' });
}

/**
 * A single VendorProduct link is reachable from both the product-centric
 * (Product edit) and vendor-centric (Vendor → Products) screens. Every
 * mutation below invalidates the broad `vendor-products` key prefix rather
 * than its own narrow direction, so an edit made from either screen is
 * reflected in the other without a manual refetch.
 */
function useVendorProductMutations() {
  const queryClient = useTenantQueryClient();
  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: VENDOR_PRODUCTS_QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: createVendorProduct,
    onSuccess: () => {
      invalidateAll();
      toast.success('Vendor pricing added');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to add vendor pricing'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateVendorProductRequest }) => updateVendorProduct(id, dto),
    onSuccess: () => {
      invalidateAll();
      toast.success('Vendor pricing updated');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to update vendor pricing'),
  });

  const removeMutation = useMutation({
    mutationFn: deleteVendorProduct,
    onSuccess: () => {
      invalidateAll();
      toast.success('Vendor pricing removed');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Failed to remove vendor pricing'),
  });

  return {
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: (id: string, dto: UpdateVendorProductRequest) => updateMutation.mutateAsync({ id, dto }),
    isUpdating: updateMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}

export function useVendorProductsForProduct(productId: string | null) {
  const queryKey = [...VENDOR_PRODUCTS_QUERY_KEY, 'product', productId];

  const listQuery = useTenantQuery({
    queryKey,
    queryFn: () => fetchVendorProductsForProduct(productId!),
    enabled: !!productId,
    staleTime: 30 * 1000,
  });

  return {
    vendorProducts: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    ...useVendorProductMutations(),
  };
}

export function useVendorProductsForVendor(vendorId: string | null) {
  const queryKey = [...VENDOR_PRODUCTS_QUERY_KEY, 'vendor', vendorId];

  const listQuery = useTenantQuery({
    queryKey,
    queryFn: () => fetchVendorProductsForVendor(vendorId!),
    enabled: !!vendorId,
    staleTime: 30 * 1000,
  });

  return {
    vendorProducts: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    ...useVendorProductMutations(),
  };
}

/** Active vendors and prices per product, one request for the whole product list. */
export function useVendorSummary() {
  const query = useTenantQuery({
    queryKey: [...VENDOR_PRODUCTS_QUERY_KEY, 'summary'],
    queryFn: () => apiFetch<ProductVendorSummary[]>('/vendor-products/summary'),
    staleTime: 30 * 1000,
  });
  return new Map((query.data ?? []).map((r) => [r.productId, r.vendors]));
}

/** Vendors selling a product whose name matches `term` (server-side search; idle when the term is empty). */
export function useVendorSearchByProduct(term: string, includeInactive: boolean) {
  const query = useTenantQuery({
    queryKey: [...VENDOR_PRODUCTS_QUERY_KEY, 'search', term, includeInactive],
    queryFn: () => searchVendorsByProduct(term, includeInactive),
    enabled: term.length > 0,
    staleTime: 30 * 1000,
  });

  return { results: query.data ?? [], isLoading: query.isLoading && term.length > 0 };
}
