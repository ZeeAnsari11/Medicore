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
import { useBranches } from '@/hooks/use-branches';
import { ApiError } from '@/lib/api-client';
import type { Branch, UpdateBranchRequest } from '@medicore/shared-types';

interface BranchDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  branch?: Branch;
  onOpenChange: (open: boolean) => void;
}

interface BranchFormValues {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isMain: boolean;
}

export function BranchDialog({ open, mode, branch, onOpenChange }: BranchDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useBranches();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<BranchFormValues>({
    defaultValues: {
      name: branch?.name ?? '',
      code: branch?.code ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
      isMain: branch?.isMain ?? false,
    },
  });

  React.useEffect(() => {
    reset({
      name: branch?.name ?? '',
      code: branch?.code ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
      isMain: branch?.isMain ?? false,
    });
  }, [branch, reset]);

  const onSubmit = async (values: BranchFormValues) => {
    if (mode === 'create') {
      await create(values);
    } else if (mode === 'edit' && branch) {
      const dto: UpdateBranchRequest = {};
      if (values.name !== branch.name) dto.name = values.name;
      if (values.code !== branch.code) dto.code = values.code;
      if (values.address !== branch.address) dto.address = values.address;
      if (values.phone !== branch.phone) dto.phone = values.phone;
      if (values.isMain !== branch.isMain) dto.isMain = values.isMain;
      await update(branch.id, dto);
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
          <DialogTitle>{mode === 'create' ? 'Create Branch' : 'Edit Branch'}</DialogTitle>
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
              placeholder="e.g., Lahore Branch"
              aria-invalid={!!errors.name}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              placeholder="e.g., LHR"
              aria-invalid={!!errors.code}
              {...register('code', { required: 'Code is required', minLength: { value: 2, message: 'Too short' } })}
            />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="Optional" {...register('address')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="Optional" {...register('phone')} />
          </div>

          <Controller
            control={control}
            name="isMain"
            render={({ field: { value, onChange } }) => (
              <div className="flex items-center space-x-2">
                <Checkbox id="isMain" checked={value} onCheckedChange={onChange} />
                <label htmlFor="isMain" className="text-sm cursor-pointer">
                  Main branch
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
