'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Input, Label, ComboboxWithCreate } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { useCategories } from '@/hooks/use-categories';
import { useBranches } from '@/hooks/use-branches';
import { useBranchField } from '@/hooks/use-branch-field';
import { BranchField } from '@/components/branch-field';
import { useVendors } from '@/hooks/use-vendors';
import { VendorDialog } from '../../vendors/components/vendor-dialog';
import { ManufacturerDialog } from '../../manufacturers/components/manufacturer-dialog';
import { CategoryQuickCreateDialog } from './category-quick-create-dialog';
import type { Product } from '@medicore/shared-types';

const PRICE_FIELDS = [
  { name: 'tp', label: 'TP', hint: 'trade, sale' },
  { name: 'cp', label: 'CP', hint: 'cost' },
  { name: 'rp', label: 'RP', hint: 'retail' },
] as const;

export interface ProductFormValues {
  /** Branch the product belongs to; chosen on create, fixed afterwards. */
  branchId: string;
  name: string;
  genericName: string;
  manufacturerId: string;
  categoryId?: string;
  barcode?: string;
  unit: string;
  packing?: string;
  tp: number;
  cp: number;
  rp: number;
  minStockLevel?: number;
  /** Create-mode only: vendor to link the new product to (not part of the Product itself). */
  vendorId?: string;
}

interface ProductFormProps {
  formId: string;
  product?: Product;
  showVendor?: boolean;
  /** Create the product in this branch with the Branch field locked (opened from a branch-bound screen). */
  lockedBranchId?: string;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
}

/**
 * The Product Add/Edit form fields, extracted so every entry point (the
 * Products page dialog, the Vendor → Products screen) shares one
 * implementation rather than maintaining parallel copies. Purely
 * presentational — owns its react-hook-form state and renders its own
 * <form>, but the actual create/update mutation call stays with the caller.
 */
export function ProductForm({ formId, product, showVendor, lockedBranchId, onSubmit }: ProductFormProps) {
  const { manufacturers } = useManufacturers();
  const { categories } = useCategories();
  const branchField = useBranchField();
  const { has } = usePermissions();
  const { branches } = useBranches();
  // Prices are fixed at creation; changing them later needs the edit_prices action.
  const priceLocked = !!product && !has('products:edit_prices');

  const [manufacturerDialogOpen, setManufacturerDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    trigger,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues>({
    defaultValues: {
      branchId: product?.branchId ?? lockedBranchId ?? branchField.defaultBranchId,
      name: product?.name ?? '',
      genericName: product?.genericName ?? '',
      manufacturerId: product?.manufacturerId ?? '',
      categoryId: product?.categoryId ?? '',
      barcode: product?.barcode ?? '',
      unit: product?.unit ?? '',
      packing: product?.packing ?? '',
      tp: product?.tp,
      cp: product?.cp,
      rp: product?.rp,
      minStockLevel: product?.minStockLevel,
      vendorId: '',
    },
  });

  const branchId = watch('branchId');
  const { vendors } = useVendors(undefined, branchId);
  // Manufacturers and vendors come from the product's own branch (a manufacturer with no branch is shared);
  // the top-bar branch has no say here, and nothing is offered until a branch is chosen.
  const branchManufacturers = branchId ? manufacturers.filter((m) => !m.branchId || m.branchId === branchId) : [];
  const branchVendors = branchId ? vendors.filter((v) => v.branchId === branchId) : [];

  return (
    <>
      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {product || lockedBranchId ? (
          <div className="space-y-1.5">
            <Label htmlFor="branchName">Branch</Label>
            <Input id="branchName" value={branches.find((b) => b.id === (product?.branchId ?? lockedBranchId))?.name ?? '—'} disabled readOnly />
          </div>
        ) : (
          <Controller
            control={control}
            name="branchId"
            rules={{ required: 'Branch is required' }}
            render={({ field: { value, onChange } }) => (
              <BranchField
                field={branchField}
                value={value}
                onChange={(v) => {
                  onChange(v);
                  // The chosen manufacturer/vendor may not exist in the new branch.
                  setValue('manufacturerId', '');
                  setValue('vendorId', '');
                }}
                error={errors.branchId?.message}
              />
            )}
          />
        )}

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
          <Label htmlFor="genericName">
            Generic name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="genericName"
            placeholder="e.g., Paracetamol"
            aria-invalid={!!errors.genericName}
            {...register('genericName', { required: 'Generic name is required', validate: (v) => !!v?.trim() || 'Generic name is required' })}
          />
          {errors.genericName && <p className="text-xs text-destructive">{errors.genericName.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>
            Manufacturer <span className="text-destructive">*</span>
          </Label>
          <Controller
            control={control}
            name="manufacturerId"
            rules={{ required: 'Manufacturer is required' }}
            render={({ field: { value, onChange } }) => (
              <ComboboxWithCreate
                value={value}
                onChange={onChange}
                options={branchManufacturers.map((m) => ({ value: m.id, label: m.name }))}
                placeholder={branchId ? 'Select manufacturer' : 'Select a branch first'}
                disabled={!branchId}
                onCreateNew={() => setManufacturerDialogOpen(true)}
                createLabel={() => 'Create new manufacturer'}
              />
            )}
          />
          {errors.manufacturerId && <p className="text-xs text-destructive">{errors.manufacturerId.message}</p>}
        </div>

        {showVendor && (
          <div className="space-y-1.5">
            <Label>
              Vendor <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={control}
              name="vendorId"
              rules={{ required: 'Vendor is required' }}
              render={({ field: { value, onChange } }) => (
                <ComboboxWithCreate
                  value={value}
                  onChange={onChange}
                  options={branchVendors.map((v) => ({ value: v.id, label: v.company }))}
                  placeholder={branchId ? 'Select vendor' : 'Select a branch first'}
                  disabled={!branchId}
                  onCreateNew={() => setVendorDialogOpen(true)}
                  createLabel={() => 'Create new vendor'}
                />
              )}
            />
            {errors.vendorId && <p className="text-xs text-destructive">{errors.vendorId.message}</p>}
            <p className="text-xs text-muted-foreground">Needed to purchase this product from the vendor.</p>
          </div>
        )}

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
            <Input
              id="unit"
              placeholder="e.g., tablet"
              aria-invalid={!!errors.unit}
              {...register('unit', { required: 'Unit is required' })}
            />
            {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="packing">Packing</Label>
            <Input id="packing" placeholder="e.g., 10x10" {...register('packing')} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {PRICE_FIELDS.map(({ name, label, hint }) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={name}>
                {label} <span className="text-xs text-muted-foreground">({hint})</span>
              </Label>
              <Input
                id={name}
                type="number"
                step="0.01"
                placeholder="0.00"
                disabled={priceLocked}
                aria-invalid={!!errors[name]}
                {...register(name, {
                  required: 'Required',
                  valueAsNumber: true,
                  min: { value: 0, message: 'Must be ≥ 0' },
                  // TP depends on CP and RP on TP, so editing one re-checks its neighbours.
                  onChange: () => void trigger(['tp', 'rp']),
                  validate: (v) => {
                    const { tp, cp } = getValues();
                    if (Number.isNaN(v)) return 'Required';
                    if (name === 'tp' && v < cp) return `Must be ≥ CP (${cp})`;
                    if (name === 'rp' && v < tp) return `Must be ≥ TP (${tp})`;
                    return true;
                  },
                })}
              />
              {errors[name] && <p className="text-xs text-destructive">{errors[name]?.message}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="minStockLevel">Min stock level</Label>
            <Input id="minStockLevel" type="number" placeholder="Optional" {...register('minStockLevel')} />
          </div>
        </div>
      </form>

      <ManufacturerDialog
        open={manufacturerDialogOpen}
        mode="create"
        defaultBranchId={branchId || undefined}
        onOpenChange={setManufacturerDialogOpen}
        onCreated={(created) => setValue('manufacturerId', created.id, { shouldValidate: true })}
      />
      <VendorDialog
        open={vendorDialogOpen}
        mode="create"
        defaultBranchId={branchId || undefined}
        onOpenChange={setVendorDialogOpen}
        onCreated={(created) => setValue('vendorId', created.id, { shouldValidate: true })}
      />
      <CategoryQuickCreateDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onCreated={(created) => setValue('categoryId', created.id, { shouldValidate: true })}
      />
    </>
  );
}
