'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label, Alert } from '@medicore/ui';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { ApiError } from '@/lib/api-client';
import type { Manufacturer, UpdateManufacturerRequest } from '@medicore/shared-types';

interface ManufacturerDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  manufacturer?: Manufacturer;
  onOpenChange: (open: boolean) => void;
  onCreated?: (manufacturer: Manufacturer) => void;
}

interface ManufacturerFormValues {
  name: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}

export function ManufacturerDialog({ open, mode, manufacturer, onOpenChange, onCreated }: ManufacturerDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useManufacturers();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ManufacturerFormValues>({
    defaultValues: {
      name: manufacturer?.name ?? '',
      country: manufacturer?.country ?? '',
      contactEmail: manufacturer?.contactEmail ?? '',
      contactPhone: manufacturer?.contactPhone ?? '',
      website: manufacturer?.website ?? '',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: manufacturer?.name ?? '',
        country: manufacturer?.country ?? '',
        contactEmail: manufacturer?.contactEmail ?? '',
        contactPhone: manufacturer?.contactPhone ?? '',
        website: manufacturer?.website ?? '',
      });
    }
  }, [open, manufacturer, reset]);

  const onSubmit = async (values: ManufacturerFormValues) => {
    if (mode === 'create') {
      const created = await create(values);
      onCreated?.(created);
    } else if (mode === 'edit' && manufacturer) {
      const dto: UpdateManufacturerRequest = {};
      if (values.name !== manufacturer.name) dto.name = values.name;
      if (values.country !== manufacturer.country) dto.country = values.country;
      if (values.contactEmail !== manufacturer.contactEmail) dto.contactEmail = values.contactEmail;
      if (values.contactPhone !== manufacturer.contactPhone) dto.contactPhone = values.contactPhone;
      if (values.website !== manufacturer.website) dto.website = values.website;
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" placeholder="Optional" {...register('country')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" type="email" placeholder="Optional" {...register('contactEmail')} />
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
          <Button onClick={handleSubmit(onSubmit)} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
