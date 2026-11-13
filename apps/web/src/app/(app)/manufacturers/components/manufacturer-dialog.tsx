'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label, Alert } from '@medicore/ui';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { usePermissions } from '@/hooks/use-permissions';
import { BranchField } from '@/components/branch-field';
import { useBranchField } from '@/hooks/use-branch-field';
import { ApiError } from '@/lib/api-client';
import type { Manufacturer, UpdateManufacturerRequest } from '@medicore/shared-types';

interface ManufacturerDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  manufacturer?: Manufacturer;
  onOpenChange: (open: boolean) => void;
  onCreated?: (manufacturer: Manufacturer) => void;
  /** Pre-selects the Branch field (e.g. quick-create from a branch-owned form); defaults to the locked branch. */
  defaultBranchId?: string;
}

interface ManufacturerFormValues {
  name: string;
  country?: string;
  contactPhone?: string;
  website?: string;
  branchId: string;
}

export function ManufacturerDialog({ open, mode, manufacturer, onOpenChange, onCreated, defaultBranchId }: ManufacturerDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useManufacturers();
  const { has } = usePermissions();
  const branchField = useBranchField();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    setValue,
    formState: { errors },
  } = useForm<ManufacturerFormValues>({
    defaultValues: {
      name: manufacturer?.name ?? '',
      country: manufacturer?.country ?? '',
      contactPhone: manufacturer?.contactPhone ?? '',
      website: manufacturer?.website ?? '',
      branchId: manufacturer?.branchId ?? defaultBranchId ?? branchField.defaultBranchId,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: manufacturer?.name ?? '',
        country: manufacturer?.country ?? '',
          contactPhone: manufacturer?.contactPhone ?? '',
        website: manufacturer?.website ?? '',
        branchId: manufacturer?.branchId ?? defaultBranchId ?? branchField.defaultBranchId,
      });
    }
  }, [open, manufacturer, reset, branchField.defaultBranchId, defaultBranchId]);

  const onSubmit = async (values: ManufacturerFormValues, alsoCreateVendor = false) => {
    if (mode === 'create' && !values.branchId) {
      setError('branchId', { message: 'Branch is required' });
      return;
    }
    if (mode === 'create') {
      const created = await create({ ...values, alsoCreateVendor: alsoCreateVendor || undefined });
      onCreated?.(created);
    } else if (mode === 'edit' && manufacturer) {
      const dto: UpdateManufacturerRequest = {};
      if (values.name !== manufacturer.name) dto.name = values.name;
      if (values.country !== manufacturer.country) dto.country = values.country;
      if (values.contactPhone !== manufacturer.contactPhone) dto.contactPhone = values.contactPhone;
      if (values.website !== manufacturer.website) dto.website = values.website;
      if (values.branchId && values.branchId !== manufacturer.branchId) dto.branchId = values.branchId;
      await update(manufacturer.id, dto);
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Manufacturer' : 'Edit Manufacturer'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit((values) => onSubmit(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., GSK"
              aria-invalid={!!errors.name}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <BranchField
            field={branchField}
            value={watch('branchId')}
            onChange={(v) => setValue('branchId', v, { shouldValidate: true })}
            error={errors.branchId?.message}
          />

          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" placeholder="Optional" {...register('country')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input id="contactPhone" placeholder="Optional" {...register('contactPhone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Website</Label>
            <Input id="website" placeholder="Optional" {...register('website')} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'create' && has('vendors:create') && (
            <Button
              variant="outline"
              onClick={handleSubmit((values) => onSubmit(values, true))}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save as Manufacturer + Vendor'}
            </Button>
          )}
          <Button onClick={handleSubmit((values) => onSubmit(values))} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
