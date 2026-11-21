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
  ComboboxWithCreate,
} from '@medicore/ui';
import { BranchField } from '@/components/branch-field';
import { useBranchField } from '@/hooks/use-branch-field';
import { useCustomers } from '@/hooks/use-customers';
import { useLocations } from '@/hooks/use-locations';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import { CityQuickCreateDialog, TerritoryQuickCreateDialog } from './location-quick-create-dialogs';
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
  address: string;
  code?: string;
  territory: string;
  city: string;
  isDealer: boolean;
}

export function CustomerDialog({ open, mode, customer, onOpenChange, onCreated }: CustomerDialogProps) {
  const { create, update, isCreating, isUpdating, createError } = useCustomers();
  const branchField = useBranchField();
  const { has } = usePermissions();
  const [cityDialogOpen, setCityDialogOpen] = React.useState(false);
  const [territoryDialogOpen, setTerritoryDialogOpen] = React.useState(false);

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
      code: customer?.code ?? '',
      territory: customer?.territory ?? '',
      city: customer?.city ?? '',
      isDealer: customer?.isDealer ?? false,
    },
  });

  const formBranchId = watch('branchId');
  // The lists belong to the customer's branch (the form's own Branch field), so they wait for it.
  const { cities, territories } = useLocations(open && !!formBranchId, formBranchId);
  React.useEffect(() => {
    if (open) {
      reset({
        name: customer?.name ?? '',
        branchId: customer?.branchId ?? branchField.defaultBranchId,
        phone: customer?.phone ?? '',
        address: customer?.address ?? '',
        code: customer?.code ?? '',
        territory: customer?.territory ?? '',
        city: customer?.city ?? '',
        isDealer: customer?.isDealer ?? false,
      });
    }
  }, [open, customer, reset, branchField.defaultBranchId]);

  const cityValue = watch('city');
  const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const selectedCity = cities.find((c) => sameName(c.name, cityValue)) ?? null;

  // Active entries only, plus what the customer already has (an older or deactivated spelling stays selectable).
  const withCurrent = (names: string[], current?: string) =>
    [...new Set([...names, ...(current?.trim() && !names.some((n) => sameName(n, current)) ? [current.trim()] : [])])];
  const cityOptions = withCurrent(cities.filter((c) => c.isActive).map((c) => c.name), cityValue).map((n) => ({ value: n, label: n }));
  const territoryValue = watch('territory');
  const territoryOptions = withCurrent(
    territories.filter((t) => t.isActive && t.cityId === selectedCity?.id).map((t) => t.name),
    territoryValue,
  ).map((n) => ({ value: n, label: n }));
  const canCreateLocations = has('locations:create');

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
              onChange={(v) => {
                setValue('branchId', v, { shouldValidate: true });
                // City and territory lists are per branch: earlier picks no longer apply.
                if (v !== formBranchId) {
                  setValue('city', '');
                  setValue('territory', '');
                }
              }}
              error={errors.branchId?.message}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="Optional" {...register('phone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="e.g., 33 Munir Shaheed Colony"
              aria-invalid={!!errors.address}
              {...register('address', { required: 'Address is required', validate: (v) => !!v?.trim() || 'Address is required' })}
            />
            {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" placeholder="Optional" {...register('code')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Controller
                control={control}
                name="city"
                rules={{ validate: (v) => !!v?.trim() || 'City is required' }}
                render={({ field: { value, onChange } }) => (
                  <ComboboxWithCreate
                    id="city"
                    value={value}
                    onChange={(v) => {
                      if (v !== value) setValue('territory', '', { shouldValidate: false });
                      onChange(v);
                    }}
                    options={cityOptions}
                    disabled={!formBranchId}
                    placeholder={formBranchId ? 'Select city' : 'Select a branch first'}
                    searchPlaceholder="Search cities..."
                    onCreateNew={canCreateLocations && formBranchId ? () => setCityDialogOpen(true) : undefined}
                    createLabel={() => 'Create new city'}
                  />
                )}
              />
              {errors.city && <p className="text-xs text-destructive">{errors.city.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="territory">Territory</Label>
              <Controller
                control={control}
                name="territory"
                rules={{ validate: (v) => !!v?.trim() || 'Territory is required' }}
                render={({ field: { value, onChange } }) => (
                  <ComboboxWithCreate
                    id="territory"
                    value={value}
                    onChange={onChange}
                    options={territoryOptions}
                    disabled={!cityValue?.trim()}
                    placeholder={cityValue?.trim() ? 'Select territory' : 'Select a city first'}
                    searchPlaceholder="Search territories..."
                    onCreateNew={canCreateLocations && selectedCity ? () => setTerritoryDialogOpen(true) : undefined}
                    createLabel={() => 'Create new territory'}
                  />
                )}
              />
              {errors.territory && <p className="text-xs text-destructive">{errors.territory.message}</p>}
            </div>
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

      <CityQuickCreateDialog
        open={cityDialogOpen}
        branchId={formBranchId || null}
        onOpenChange={setCityDialogOpen}
        onCreated={(name) => {
          setValue('city', name, { shouldValidate: true });
          setValue('territory', '');
        }}
      />
      <TerritoryQuickCreateDialog
        open={territoryDialogOpen}
        city={selectedCity}
        onOpenChange={setTerritoryDialogOpen}
        onCreated={(name) => setValue('territory', name, { shouldValidate: true })}
      />
    </Dialog>
  );
}
