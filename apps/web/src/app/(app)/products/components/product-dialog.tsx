'use client';

import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Alert } from '@medicore/ui';
import { useProducts } from '@/hooks/use-products';
import { useVendorProductsForVendor } from '@/hooks/use-vendor-products';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import { VendorPricingSection } from './vendor-pricing-section';
import { ProductForm, type ProductFormValues } from './product-form';
import type { Product } from '@medicore/shared-types';

interface ProductDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  product?: Product;
  onOpenChange: (open: boolean) => void;
  onCreated?: (product: Product) => void;
  /** Set when the caller links the vendor itself (Vendor → Products); hides the vendor field. */
  defaultVendorId?: string;
  /** Set when the caller works inside one branch (e.g. New Sale): the product is created there, branch locked. */
  lockedBranchId?: string;
}

const FORM_ID = 'product-form';

export function ProductDialog({ open, mode, product, onOpenChange, onCreated, defaultVendorId, lockedBranchId }: ProductDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useProducts();
  const { create: linkVendor } = useVendorProductsForVendor(null);
  const { has } = usePermissions();
  const showVendor = mode === 'create' && !defaultVendorId && has('vendors:create');

  const handleSubmit = async (values: ProductFormValues) => {
    const { vendorId, branchId, ...productValues } = values;
    const priceLocked = mode === 'edit' && !has('products:edit_prices');
    const payload = {
      ...productValues,
      barcode: values.barcode?.trim() || undefined,
      tp: Number(values.tp),
      cp: Number(values.cp),
      rp: values.rp === undefined || Number.isNaN(Number(values.rp)) ? undefined : Number(values.rp),
      minStockLevel: values.minStockLevel !== undefined ? Number(values.minStockLevel) : undefined,
    };

    if (mode === 'create') {
      const created = await create({ ...payload, branchId });
      if (vendorId) {
        // The product is already saved; a failed link is reported by the mutation's own toast.
        await linkVendor({ vendorId, productId: created.id, purchasePrice: created.cp }).catch(() => undefined);
      }
      onCreated?.(created);
    } else if (mode === 'edit' && product) {
      if (priceLocked) {
        // Server rejects price changes without edit_prices; send everything else.
        const { tp: _tp, cp: _cp, rp: _rp, ...rest } = payload;
        await update(product.id, rest);
      } else {
        await update(product.id, payload);
      }
    }
    onOpenChange(false);
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Product' : 'Edit Product'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}

        <ProductForm key={`${mode}-${product?.id ?? 'new'}`} formId={FORM_ID} product={product} showVendor={showVendor} lockedBranchId={lockedBranchId} onSubmit={handleSubmit} />

        {mode === 'edit' && product && <VendorPricingSection productId={product.id} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
