'use client';

import React from 'react';
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
  email: string;
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
      email: user?.email ?? '',
      fullName: user?.fullName ?? '',
      tenantRole: user?.tenantRole ?? TenantRole.TENANT_USER,
      roleId: user?.roleId ?? null,
    },
  });

  const currentRoleId = watch('roleId');
  const currentTenantRole = watch('tenantRole');
  const isAdminRole = currentTenantRole === TenantRole.TENANT_SUPER_ADMIN;

  // Clear roleId when tenant role changes to admin
  React.useEffect(() => {
    if (isAdminRole && currentRoleId) {
      setValue('roleId', null);
    }
  }, [isAdminRole, currentRoleId, setValue]);

  const onSubmit = async (values: UserFormValues) => {
    if (mode === 'create') {
      const result = await create({
        email: values.email,
        fullName: values.fullName,
        tenantRole: values.tenantRole,
        roleId: values.roleId || undefined,
      });
      if (result && 'temporaryPassword' in result) {
        onUserCreated?.(result.temporaryPassword);
      }
    } else if (mode === 'edit' && user) {
      const dto: UpdateUserRequest = {};
      if (values.fullName !== user.fullName) dto.fullName = values.fullName;
      if (values.tenantRole !== user.tenantRole) dto.tenantRole = values.tenantRole;
      if (values.roleId !== user.roleId) dto.roleId = values.roleId;

      await update({ id: user.id, dto });
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              aria-invalid={!!errors.email}
              disabled={mode === 'edit'}
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
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
            <Label htmlFor="roleId" className={isAdminRole ? 'text-muted-foreground' : ''}>
              Assigned Role {isAdminRole ? '(Not applicable for Admin)' : '(Optional)'}
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
    </Dialog>
  );
}
