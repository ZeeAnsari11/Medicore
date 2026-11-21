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
  ComboboxWithCreate,
  Input,
  Label,
  Alert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { useUsers } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useBranches } from '@/hooks/use-branches';
import { useLocations } from '@/hooks/use-locations';
import { usePermissions } from '@/hooks/use-permissions';
import { CityQuickCreateDialog, TerritoryQuickCreateDialog } from '../../../customers/components/location-quick-create-dialogs';
import { ApiError } from '@/lib/api-client';
import { TenantRole } from '@medicore/shared-types';
import type { User, UpdateUserRequest } from '@medicore/shared-types';

const RequiredMark = () => <span className="text-destructive">*</span>;

interface UserDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  user?: User;
  onOpenChange: (open: boolean) => void;
  onUserCreated?: (password: string) => void;
}

interface UserFormValues {
  username: string;
  phone?: string;
  territory: string;
  city: string;
  address: string;
  fullName: string;
  tenantRole: TenantRole;
  roleId?: string | null;
  branchId: string;
}

export function UserDialog({
  open,
  mode,
  user,
  onOpenChange,
  onUserCreated,
}: UserDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useUsers();
  const { roles } = useRoles();
  const { branches } = useBranches();
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    defaultValues: {
      username: user?.username ?? '',
      phone: user?.phone ?? '',
      territory: user?.territory ?? '',
      city: user?.city ?? '',
      address: user?.address ?? '',
      fullName: user?.fullName ?? '',
      tenantRole: user?.tenantRole ?? TenantRole.TENANT_USER,
      roleId: user?.roleId ?? null,
      branchId: user?.branchId ?? '',
    },
  });

  const { has } = usePermissions();
  const [cityDialogOpen, setCityDialogOpen] = React.useState(false);
  const [territoryDialogOpen, setTerritoryDialogOpen] = React.useState(false);
  const formBranchId = watch('branchId');
  // The lists belong to the user's branch (the form's own Branch field), so they wait for it.
  const { cities, territories } = useLocations(open && !!formBranchId, formBranchId);
  const cityValue = watch('city');
  const territoryValue = watch('territory');
  const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const selectedCity = cities.find((c) => sameName(c.name, cityValue)) ?? null;
  // Active entries only, plus what the user already has (an older spelling stays selectable).
  const withCurrent = (names: string[], current?: string) =>
    [...new Set([...names, ...(current?.trim() && !names.some((n) => sameName(n, current)) ? [current.trim()] : [])])];
  const cityOptions = withCurrent(cities.filter((c) => c.isActive).map((c) => c.name), cityValue).map((n) => ({ value: n, label: n }));
  const territoryOptions = withCurrent(
    territories.filter((t) => t.isActive && t.cityId === selectedCity?.id).map((t) => t.name),
    territoryValue,
  ).map((n) => ({ value: n, label: n }));
  const canCreateLocations = has('locations:create');

  const currentRoleId = watch('roleId');
  const currentTenantRole = watch('tenantRole');
  const isAdminRole = currentTenantRole === TenantRole.TENANT_SUPER_ADMIN;

  React.useEffect(() => {
    if (open) {
      reset({
        username: user?.username ?? '',
        phone: user?.phone ?? '',
        territory: user?.territory ?? '',
        city: user?.city ?? '',
        address: user?.address ?? '',
        fullName: user?.fullName ?? '',
        tenantRole: user?.tenantRole ?? TenantRole.TENANT_USER,
        roleId: user?.roleId ?? null,
        branchId: user?.branchId ?? '',
      });
    }
  }, [open, user, reset]);

  // The branch picker is a Select, not a native input, so its rule is registered by hand.
  React.useEffect(() => {
    register('branchId', { required: 'Branch is required' });
  }, [register]);

  // Clear roleId when tenant role changes to admin
  React.useEffect(() => {
    if (isAdminRole && currentRoleId) {
      setValue('roleId', null);
    }
  }, [isAdminRole, currentRoleId, setValue]);

  const onSubmit = async (values: UserFormValues) => {
    if (mode === 'create') {
      const result = await create({
        username: values.username,
        fullName: values.fullName,
        phone: values.phone || undefined,
        territory: values.territory.trim(),
        city: values.city.trim(),
        address: values.address.trim(),
        tenantRole: values.tenantRole,
        roleId: values.roleId || undefined,
        branchId: values.branchId,
      });
      if (result && 'temporaryPassword' in result) {
        onUserCreated?.(result.temporaryPassword);
      }
    } else if (mode === 'edit' && user) {
      const dto: UpdateUserRequest = {};
      if (values.fullName !== user.fullName) dto.fullName = values.fullName;
      if ((values.phone ?? '') !== (user.phone ?? '')) dto.phone = values.phone ?? '';
      for (const name of ['territory', 'city', 'address'] as const) {
        const next = values[name].trim();
        if (next !== user[name]) dto[name] = next;
      }
      if (values.tenantRole !== user.tenantRole) dto.tenantRole = values.tenantRole;
      if (values.roleId !== user.roleId) dto.roleId = values.roleId;
      if (values.branchId !== user.branchId) dto.branchId = values.branchId;

      await update(user.id, dto);
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create User' : 'Edit User'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="branchId">
              Branch <RequiredMark />
            </Label>
            <Select
              value={watch('branchId')}
              onValueChange={(value) => setValue('branchId', value, { shouldValidate: true })}
            >
              <SelectTrigger id="branchId" aria-invalid={!!errors.branchId}>
                <SelectValue placeholder={branches.length ? 'Select a branch...' : 'No branches yet: create one first'} />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter((b) => b.isActive)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.branchId && <p className="text-xs text-destructive">{errors.branchId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">
              Username <RequiredMark />
            </Label>
            <Input
              id="username"
              autoComplete="off"
              placeholder="e.g. ali.hamza"
              aria-invalid={!!errors.username}
              disabled={mode === 'edit'}
              {...register('username', {
                required: 'Username is required',
                minLength: { value: 3, message: 'Username must be at least 3 characters' },
                pattern: {
                  value: /^[a-zA-Z0-9._-]+$/,
                  message: 'Only letters, numbers, dots, dashes and underscores',
                },
              })}
            />
            {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">
              Full Name <RequiredMark />
            </Label>
            <Input
              id="fullName"
              placeholder="John Doe"
              aria-invalid={!!errors.fullName}
              {...register('fullName', { required: 'Full name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
            />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" placeholder="Optional" {...register('phone')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">
              City <RequiredMark />
            </Label>
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
            <Label htmlFor="territory">
              Territory <RequiredMark />
            </Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="address">
              Address <RequiredMark />
            </Label>
            <Input
              id="address"
              placeholder="Street, area"
              aria-invalid={!!errors.address}
              {...register('address', { validate: (value) => !!value?.trim() || 'Address is required' })}
            />
            {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenantRole">
              Tenant Role <RequiredMark />
            </Label>
            <Select
              value={watch('tenantRole')}
              onValueChange={(value) => setValue('tenantRole', value as TenantRole)}
            >
              <SelectTrigger id="tenantRole">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TenantRole.TENANT_SUPER_ADMIN}>Admin</SelectItem>
                <SelectItem value={TenantRole.TENANT_USER}>User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roleId" className={isAdminRole ? 'text-muted-foreground' : ''}>
              User Role {isAdminRole ? '(Not applicable for Admin)' : '(controls which menus this user can see)'}
            </Label>
            <div className={isAdminRole ? 'pointer-events-none opacity-50' : ''}>
              <Select
                value={currentRoleId || ''}
                onValueChange={(value) => {
                  if (!isAdminRole) {
                    setValue('roleId', value || null);
                  }
                }}
              >
                <SelectTrigger id="roleId" disabled={isAdminRole}>
                  <SelectValue placeholder={isAdminRole ? 'Admin has access to all menus' : 'Select a role...'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {roles
                    .filter((r) => r.isActive)
                    .map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
