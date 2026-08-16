'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label, Alert } from '@medicore/ui';
import { useVendors } from '@/hooks/use-vendors';
import { ApiError } from '@/lib/api-client';
import type { Vendor, UpdateVendorRequest } from '@medicore/shared-types';

interface VendorDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  vendor?: Vendor;
  onOpenChange: (open: boolean) => void;
  onCreated?: (vendor: Vendor) => void;
}

interface VendorFormValues {
  company: string;
  distributorType?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
}

export function VendorDialog({ open, mode, vendor, onOpenChange, onCreated }: VendorDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useVendors();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VendorFormValues>({
    defaultValues: {
      company: vendor?.company ?? '',
      distributorType: vendor?.distributorType ?? '',
      contactName: vendor?.contactName ?? '',
      contactPhone: vendor?.contactPhone ?? '',
      contactEmail: vendor?.contactEmail ?? '',
      address: vendor?.address ?? '',
    },
  });

  React.useEffect(() => {
    reset({
      company: vendor?.company ?? '',
      distributorType: vendor?.distributorType ?? '',
      contactName: vendor?.contactName ?? '',
      contactPhone: vendor?.contactPhone ?? '',
      contactEmail: vendor?.contactEmail ?? '',
      address: vendor?.address ?? '',
    });
  }, [vendor, reset]);

  const onSubmit = async (values: VendorFormValues) => {
    if (mode === 'create') {
      const created = await create(values);
      onCreated?.(created);
    } else if (mode === 'edit' && vendor) {
      const dto: UpdateVendorRequest = {};
      if (values.company !== vendor.company) dto.company = values.company;
      if (values.distributorType !== vendor.distributorType) dto.distributorType = values.distributorType;
      if (values.contactName !== vendor.contactName) dto.contactName = values.contactName;
      if (values.contactPhone !== vendor.contactPhone) dto.contactPhone = values.contactPhone;
      if (values.contactEmail !== vendor.contactEmail) dto.contactEmail = values.contactEmail;
      if (values.address !== vendor.address) dto.address = values.address;
      await update(vendor.id, dto);
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
          <DialogTitle>{mode === 'create' ? 'Create Vendor' : 'Edit Vendor'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              placeholder="e.g., City Pharma Distributors"
              aria-invalid={!!errors.company}
              {...register('company', { required: 'Company is required', minLength: { value: 2, message: 'Too short' } })}
            />
            {errors.company && <p className="text-xs text-destructive">{errors.company.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="distributorType">Type</Label>
            <Input id="distributorType" placeholder="e.g., Distributor, Wholesaler" {...register('distributorType')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactName">Contact name</Label>
            <Input id="contactName" placeholder="Optional" {...register('contactName')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input id="contactPhone" placeholder="Optional" {...register('contactPhone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" type="email" placeholder="Optional" {...register('contactEmail')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="Optional" {...register('address')} />
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
