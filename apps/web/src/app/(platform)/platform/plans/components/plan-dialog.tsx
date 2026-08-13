'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { usePlatformPlans } from '@/hooks/use-platform-plans';
import { ApiError } from '@/lib/api-client';
import { BillingInterval } from '@medicore/shared-types';
import type { Plan } from '@medicore/shared-types';

interface PlanDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  plan?: Plan;
  onOpenChange: (open: boolean) => void;
}

interface PlanFormValues {
  name: string;
  description: string;
  price: string;
  currency: string;
  billingInterval: BillingInterval;
  maxUsers: string;
}

function toFormValues(plan?: Plan): PlanFormValues {
  return {
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price: plan ? (plan.priceCents / 100).toString() : '',
    currency: plan?.currency ?? 'USD',
    billingInterval: plan?.billingInterval ?? BillingInterval.MONTHLY,
    maxUsers: plan?.maxUsers != null ? plan.maxUsers.toString() : '',
  };
}

export function PlanDialog({ open, mode, plan, onOpenChange }: PlanDialogProps) {
  const { create, update, isCreating, isUpdating } = usePlatformPlans();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PlanFormValues>({ defaultValues: toFormValues(plan) });

  useEffect(() => {
    if (open) {
      reset(toFormValues(plan));
    }
  }, [open, plan, reset]);

  const onSubmit = async (values: PlanFormValues) => {
    const priceCents = Math.round(parseFloat(values.price) * 100);
    const maxUsers = values.maxUsers.trim() === '' ? null : parseInt(values.maxUsers, 10);

    try {
      if (mode === 'create') {
        await create({
          name: values.name,
          description: values.description,
          priceCents,
          currency: values.currency.toUpperCase(),
          billingInterval: values.billingInterval,
          maxUsers,
        });
      } else if (mode === 'edit' && plan) {
        await update(plan.id, {
          name: values.name,
          description: values.description,
          priceCents,
          currency: values.currency.toUpperCase(),
          billingInterval: values.billingInterval,
          maxUsers,
        });
      }
      onOpenChange(false);
    } catch {
      // Errors are surfaced via toast by the hook.
    }
  };

  const isLoading = isCreating || isUpdating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Plan' : 'Edit Plan'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Growth"
              aria-invalid={!!errors.name}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="For growing pharmacies" {...register('description')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="49.00"
                aria-invalid={!!errors.price}
                {...register('price', { required: 'Price is required' })}
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                placeholder="USD"
                maxLength={3}
                aria-invalid={!!errors.currency}
                {...register('currency', { required: 'Currency is required', minLength: 3, maxLength: 3 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="billingInterval">Billing interval</Label>
              <Select
                value={watch('billingInterval')}
                onValueChange={(value) => setValue('billingInterval', value as BillingInterval)}
              >
                <SelectTrigger id="billingInterval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BillingInterval.MONTHLY}>Monthly</SelectItem>
                  <SelectItem value={BillingInterval.YEARLY}>Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxUsers">Max users</Label>
              <Input id="maxUsers" type="number" min="1" placeholder="Unlimited" {...register('maxUsers')} />
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
  );
}
