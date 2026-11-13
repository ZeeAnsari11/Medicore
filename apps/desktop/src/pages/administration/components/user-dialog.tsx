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
import { ApiError } from '@/lib/api-client';
import { TenantRole } from '@medicore/shared-types';
import type { User, UpdateUserRequest } from '@medicore/shared-types';

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
  fullName: string;
  tenantRole: TenantRole;
  roleId?: string | null;
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
      fullName: user?.fullName ?? '',
      tenantRole: user?.tenantRole ?? TenantRole.TENANT_USER,
      roleId: user?.roleId ?? null,
    },
  });

  const currentRoleId = watch('roleId');

  useEffect(() => {
    if (open) {
      reset({
        username: user?.username ?? '',
        phone: user?.phone ?? '',
        fullName: user?.fullName ?? '',
        tenantRole: user?.tenantRole ?? TenantRole.TENANT_USER,
        roleId: user?.roleId ?? null,
      });
    }
  }, [open, user, reset]);

  const onSubmit = async (values: UserFormValues) => {
    if (mode === 'create') {
      const result = await create({
        username: values.username,
        fullName: values.fullName,
        phone: values.phone || undefined,
        tenantRole: values.tenantRole,
        roleId: values.roleId || undefined,
      });
      if (result && 'temporaryPassword' in result) {
        onUserCreated?.(result.temporaryPassword);
      }
    } else if (mode === 'edit' && user) {
      const dto: UpdateUserRequest = {};
      if (values.fullName !== user.fullName) dto.fullName = values.fullName;
      if ((values.phone ?? '') !== (user.phone ?? '')) dto.phone = values.phone ?? '';
      if (values.tenantRole !== user.tenantRole) dto.tenantRole = values.tenantRole;
      if (values.roleId !== user.roleId) dto.roleId = values.roleId;

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
            <Label htmlFor="username">Username</Label>
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
            <Label htmlFor="fullName">Full Name</Label>
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
            <Label htmlFor="tenantRole">Tenant Role</Label>
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
