'use client';

import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Alert,
  ComboboxWithCreate,
} from '@medicore/ui';
import { useProducts } from '@/hooks/use-products';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { useCategories } from '@/hooks/use-categories';
import { ApiError } from '@/lib/api-client';
import { ManufacturerDialog } from '../../manufacturers/components/manufacturer-dialog';
import { CategoryQuickCreateDialog } from './category-quick-create-dialog';
import type { Product, UpdateProductRequest } from '@medicore/shared-types';

interface ProductDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  product?: Product;
  onOpenChange: (open: boolean) => void;
  onCreated?: (product: Product) => void;
}

interface ProductFormValues {
  name: string;
  genericName?: string;
  manufacturerId: string;
  categoryId?: string;
  barcode?: string;
  unit: string;
  packing?: string;
  purchasePrice: number;
  salePrice: number;
  dealerPrice?: number;
  minStockLevel?: number;
}

export function ProductDialog({ open, mode, product, onOpenChange, onCreated }: ProductDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useProducts();
  const { manufacturers } = useManufacturers();
  const { categories } = useCategories();

  const [manufacturerDialogOpen, setManufacturerDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    defaultValues: {
      name: product?.name ?? '',
      genericName: product?.genericName ?? '',
      manufacturerId: product?.manufacturerId ?? '',
      categoryId: product?.categoryId ?? '',
      barcode: product?.barcode ?? '',
      unit: product?.unit ?? '',
      packing: product?.packing ?? '',
      purchasePrice: product?.purchasePrice ?? 0,
      salePrice: product?.salePrice ?? 0,
      dealerPrice: product?.dealerPrice,
      minStockLevel: product?.minStockLevel,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: product?.name ?? '',
        genericName: product?.genericName ?? '',
        manufacturerId: product?.manufacturerId ?? '',
        categoryId: product?.categoryId ?? '',
        barcode: product?.barcode ?? '',
        unit: product?.unit ?? '',
        packing: product?.packing ?? '',
        purchasePrice: product?.purchasePrice ?? 0,
        salePrice: product?.salePrice ?? 0,
        dealerPrice: product?.dealerPrice,
        minStockLevel: product?.minStockLevel,
      });
    }
  }, [open, product, reset]);

  const onSubmit = async (values: ProductFormValues) => {
    const payload = {
      ...values,
      barcode: values.barcode?.trim() || undefined,
      purchasePrice: Number(values.purchasePrice),
      salePrice: Number(values.salePrice),
      dealerPrice: values.dealerPrice !== undefined ? Number(values.dealerPrice) : undefined,
      minStockLevel: values.minStockLevel !== undefined ? Number(values.minStockLevel) : undefined,
    };

    if (mode === 'create') {
      const created = await create(payload);
      onCreated?.(created);
    } else if (mode === 'edit' && product) {
      const dto: UpdateProductRequest = payload;
      await update(product.id, dto);
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

  return (
    <>
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Panadol 500mg"
                aria-invalid={!!errors.name}
                {...register('name', { required: 'Name is required' })}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="genericName">Generic name</Label>
              <Input id="genericName" placeholder="e.g., Paracetamol" {...register('genericName')} />
            </div>

            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Controller
                control={control}
                name="manufacturerId"
                rules={{ required: 'Manufacturer is required' }}
                render={({ field: { value, onChange } }) => (
                  <ComboboxWithCreate
                    value={value}
                    onChange={onChange}
                    options={manufacturers.map((m) => ({ value: m.id, label: m.name }))}
                    placeholder="Select manufacturer"
                    onCreateNew={() => setManufacturerDialogOpen(true)}
                    createLabel={() => 'Create new manufacturer'}
                  />
                )}
              />
              {errors.manufacturerId && <p className="text-xs text-destructive">{errors.manufacturerId.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field: { value, onChange } }) => (
                  <ComboboxWithCreate
                    value={value}
                    onChange={onChange}
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                    placeholder="Select category (optional)"
                    onCreateNew={() => setCategoryDialogOpen(true)}
                    createLabel={() => 'Create new category'}
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" placeholder="Optional" {...register('barcode')} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" placeholder="e.g., tablet" aria-invalid={!!errors.unit} {...register('unit', { required: 'Unit is required' })} />
                {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="packing">Packing</Label>
                <Input id="packing" placeholder="e.g., 10x10" {...register('packing')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="purchasePrice">Purchase price</Label>
                <Input
                  id="purchasePrice"
                  type="number"
                  step="0.01"
                  aria-invalid={!!errors.purchasePrice}
                  {...register('purchasePrice', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                />
                {errors.purchasePrice && <p className="text-xs text-destructive">{errors.purchasePrice.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salePrice">Sale price</Label>
                <Input
                  id="salePrice"
                  type="number"
                  step="0.01"
                  aria-invalid={!!errors.salePrice}
                  {...register('salePrice', { required: 'Required', min: { value: 0, message: 'Must be ≥ 0' } })}
                />
                {errors.salePrice && <p className="text-xs text-destructive">{errors.salePrice.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dealerPrice">Dealer price</Label>
                <Input id="dealerPrice" type="number" step="0.01" placeholder="Optional" {...register('dealerPrice')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minStockLevel">Min stock level</Label>
                <Input id="minStockLevel" type="number" placeholder="Optional" {...register('minStockLevel')} />
              </div>
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManufacturerDialog
        open={manufacturerDialogOpen}
        mode="create"
        onOpenChange={setManufacturerDialogOpen}
        onCreated={(created) => setValue('manufacturerId', created.id, { shouldValidate: true })}
      />
      <CategoryQuickCreateDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onCreated={(created) => setValue('categoryId', created.id, { shouldValidate: true })}
      />
    </>
  );
}
