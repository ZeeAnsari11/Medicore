'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@medicore/ui';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
import { ApiError } from '@/lib/api-client';
import type { Tenant } from '@medicore/shared-types';

interface EditTenantDialogProps {
  open: boolean;
  tenant?: Tenant;
  onOpenChange: (open: boolean) => void;
}

interface EditTenantFormValues {
  name: string;
  adminFullName?: string;
  username?: string;
  password?: string;
}

export function EditTenantDialog({ open, tenant, onOpenChange }: EditTenantDialogProps) {
  const { update, isUpdating, updateError, fetchTenantWithAdmin } = usePlatformTenants();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditTenantFormValues>({
    defaultValues: { name: '', adminFullName: '', username: '', password: '' },
  });

  useEffect(() => {
    if (open && tenant) {
      setIsLoading(true);
      fetchTenantWithAdmin(tenant.id)
        .then((data) => {
          reset({
            name: data.tenant.name,
            adminFullName: data.adminUser?.fullName ?? '',
            username: data.adminUser?.username ?? '',
            password: '',
          });
        })
        .catch((error) => {
          console.error('Failed to fetch tenant details:', error);
          reset({ name: tenant.name });
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, tenant, reset, fetchTenantWithAdmin]);

  const onSubmit = async (values: EditTenantFormValues) => {
    if (!tenant) return;
    try {
      await update(tenant.id, {
        name: values.name,
        ...(values.adminFullName && { adminFullName: values.adminFullName }),
        ...(values.username && { username: values.username }),
        ...(values.password && { password: values.password }),
      });
      onOpenChange(false);
    } catch {
      // Error is surfaced via updateError below.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Tenant</DialogTitle>
        </DialogHeader>

        {updateError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{updateError instanceof ApiError ? updateError.message : 'Failed to update tenant'}</span>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-tenantName">Business Name</Label>
              <Input
                id="edit-tenantName"
                aria-invalid={!!errors.name}
                {...register('name', { required: 'Business name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {tenant && (
              <div className="space-y-1.5">
                <Label>Slug (immutable)</Label>
                <Input readOnly disabled value={tenant.slug} className="font-mono text-sm" />
              </div>
            )}

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-3">Admin Account Settings</p>

              <div className="space-y-1.5">
                <Label htmlFor="edit-adminName">Admin Full Name</Label>
                <Input
                  id="edit-adminName"
                  aria-invalid={!!errors.adminFullName}
                  placeholder="Enter admin name"
                  {...register('adminFullName', {
                    minLength: {
                      value: 2,
                      message: 'Name must be at least 2 characters',
                    },
                  })}
                />
                {errors.adminFullName && <p className="text-xs text-destructive">{errors.adminFullName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-username">Admin Username</Label>
                <Input
                  id="edit-username"
                  type="text"
                  placeholder="Leave blank to keep current username"
                  aria-invalid={!!errors.username}
                  {...register('username', {
                    pattern: {
                      value: /^[a-zA-Z0-9._-]{3,}$/,
                      message: 'At least 3 characters: letters, numbers, dots, dashes, underscores',
                    },
                  })}
                />
                {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-password">Admin Password</Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  aria-invalid={!!errors.password}
                  {...register('password', {
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters',
                    },
                  })}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </div>
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isUpdating || isLoading}>
            {isUpdating ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
