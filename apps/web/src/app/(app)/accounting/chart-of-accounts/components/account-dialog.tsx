'use client';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { useAccounts } from '@/hooks/use-accounts';
import { ApiError } from '@/lib/api-client';
import { AccountType } from '@medicore/shared-types';
import type { Account } from '@medicore/shared-types';

interface AccountDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  account?: Account;
  onOpenChange: (open: boolean) => void;
}

interface AccountFormValues {
  code: string;
  name: string;
  type: AccountType;
  description?: string;
}

export function AccountDialog({ open, mode, account, onOpenChange }: AccountDialogProps) {
  const { create, update, isCreating, isUpdating, createError } = useAccounts();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    defaultValues: {
      code: account?.code ?? '',
      name: account?.name ?? '',
      type: account?.type ?? AccountType.EXPENSE,
      description: account?.description ?? '',
    },
  });

  const onSubmit = async (values: AccountFormValues) => {
    if (mode === 'create') {
      await create(values);
    } else if (account) {
      await update(account.id, { name: values.name, description: values.description });
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New Account' : 'Edit Account'}</DialogTitle>
        </DialogHeader>

        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{createError instanceof ApiError ? createError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" disabled={mode === 'edit'} {...register('code', { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field: { value, onChange } }) => (
                  <Select value={value} onValueChange={onChange} disabled={mode === 'edit'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AccountType.ASSET}>Asset</SelectItem>
                      <SelectItem value={AccountType.LIABILITY}>Liability</SelectItem>
                      <SelectItem value={AccountType.EQUITY}>Equity</SelectItem>
                      <SelectItem value={AccountType.REVENUE}>Revenue</SelectItem>
                      <SelectItem value={AccountType.EXPENSE}>Expense</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="Optional" {...register('description')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
