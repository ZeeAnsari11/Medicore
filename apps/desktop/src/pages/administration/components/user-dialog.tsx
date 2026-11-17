import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { useUsers } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useBranches } from '@/hooks/use-branches';
import { ApiError } from '@/lib/api-client';
import { TenantRole } from '@medicore/shared-types';
import type { User, UpdateUserRequest } from '@medicore/shared-types';

const LOCATION_FIELDS = [
  { name: 'territory', label: 'Territory', placeholder: 'e.g. Lahore North' },
  { name: 'city', label: 'City', placeholder: 'e.g. Lahore' },
  { name: 'address', label: 'Address', placeholder: 'Street, area' },
] as const;

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

  const currentRoleId = watch('roleId');

  useEffect(() => {
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
  useEffect(() => {
    register('branchId', { required: 'Branch is required' });
  }, [register]);

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
      for (const { name } of LOCATION_FIELDS) {
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
            <Select value={watch('branchId')} onValueChange={(value) => setValue('branchId', value, { shouldValidate: true })}>
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

          {LOCATION_FIELDS.map(({ name, label, placeholder }) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={name}>
                {label} <RequiredMark />
              </Label>
              <Input
                id={name}
                placeholder={placeholder}
                aria-invalid={!!errors[name]}
                {...register(name, { validate: (value) => !!value?.trim() || `${label} is required` })}
              />
              {errors[name] && <p className="text-xs text-destructive">{errors[name]?.message}</p>}
            </div>
          ))}

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
            <Label htmlFor="roleId">Assigned Role (Optional)</Label>
            <Select value={currentRoleId || ''} onValueChange={(value) => setValue('roleId', value || null)}>
              <SelectTrigger id="roleId">
                <SelectValue placeholder="Select a role..." />
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
