'use client';

import React from 'react';
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
  Checkbox,
} from '@medicore/ui';
import { BranchField } from '@/components/branch-field';
import { useBranchField } from '@/hooks/use-branch-field';
import { useCustomers } from '@/hooks/use-customers';
import { ApiError } from '@/lib/api-client';
import type { Customer, UpdateCustomerRequest } from '@medicore/shared-types';

interface CustomerDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  customer?: Customer;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
}

interface CustomerFormValues {
  name: string;
  branchId: string;
  phone?: string;
  address?: string;
  isDealer: boolean;
}

export function CustomerDialog({ open, mode, customer, onOpenChange, onCreated }: CustomerDialogProps) {
  const { create, update, isCreating, isUpdating, createError } = useCustomers();
  const branchField = useBranchField();

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    defaultValues: {
      name: customer?.name ?? '',
      branchId: customer?.branchId ?? branchField.defaultBranchId,
      phone: customer?.phone ?? '',
      address: customer?.address ?? '',
      isDealer: customer?.isDealer ?? false,
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        name: customer?.name ?? '',
        branchId: customer?.branchId ?? branchField.defaultBranchId,
        phone: customer?.phone ?? '',
          address: customer?.address ?? '',
        isDealer: customer?.isDealer ?? false,
      });
    }
  }, [open, customer, reset, branchField.defaultBranchId]);

  const onSubmit = async (values: CustomerFormValues) => {
    const { branchId, ...rest } = values;
    if (mode === 'create') {
      if (!branchId) {
        setError('branchId', { message: 'Branch is required' });
        return;
      }
      const created = await create({ ...rest, branchId });
      onCreated?.(created);
    } else if (mode === 'edit' && customer) {
      const dto: UpdateCustomerRequest = rest; // a customer never changes branch
      await update(customer.id, dto);
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Customer' : 'Edit Customer'}</DialogTitle>
        </DialogHeader>

        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{createError instanceof ApiError ? createError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Ali Medical Store"
              aria-invalid={!!errors.name}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {mode === 'create' && (
            <BranchField
              field={branchField}
              value={watch('branchId')}
              onChange={(v) => setValue('branchId', v, { shouldValidate: true })}
              error={errors.branchId?.message}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="Optional" {...register('phone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="Optional" {...register('address')} />
          </div>

          <Controller
            control={control}
            name="isDealer"
            render={({ field: { value, onChange } }) => (
              <div className="flex items-center space-x-2">
                <Checkbox id="isDealer" checked={value} onCheckedChange={onChange} />
                <label htmlFor="isDealer" className="text-sm cursor-pointer">
                  Dealer (gets wholesale pricing)
                </label>
              </div>
            )}
          />
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
