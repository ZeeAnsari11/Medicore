'use client';

import { useForm } from 'react-hook-form';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { useState } from 'react';
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
} from '@medicore/ui';
import { usePlatformTenants } from '@/hooks/use-platform-tenants';
import { ApiError } from '@/lib/api-client';

interface CreateTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreateTenantFormValues {
  tenantName: string;
  adminFullName: string;
  adminEmail: string;
}

export function CreateTenantDialog({ open, onOpenChange }: CreateTenantDialogProps) {
  const { create, isCreating, createError } = usePlatformTenants();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTenantFormValues>();

  const onSubmit = async (values: CreateTenantFormValues) => {
    const result = await create(values);
    if (result && 'temporaryPassword' in result) {
      setTempPassword(result.temporaryPassword);
      reset();
    }
  };

  const handleCopyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    if (!tempPassword) {
      onOpenChange(false);
      reset();
      setTempPassword(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Tenant</DialogTitle>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <span className="ml-2 text-sm">
                Tenant created successfully. Share the temporary password with the tenant administrator — it can only be displayed once.
              </span>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input id="admin-email" readOnly value={tempPassword.split(':')[0] || ''} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp-password">Temporary Password</Label>
              <div className="flex gap-2">
                <Input
                  id="temp-password"
                  readOnly
                  value={tempPassword}
                  type="password"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPassword}
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  setTempPassword(null);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {createError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <span>
                  {createError instanceof ApiError ? createError.message : 'Failed to create tenant'}
                </span>
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tenantName">Business Name</Label>
                <Input
                  id="tenantName"
                  placeholder="e.g., Acme Pharmacy"
                  aria-invalid={!!errors.tenantName}
                  {...register('tenantName', { required: 'Business name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
                />
                {errors.tenantName && <p className="text-xs text-destructive">{errors.tenantName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adminFullName">Admin Full Name</Label>
                <Input
                  id="adminFullName"
                  placeholder="John Doe"
                  aria-invalid={!!errors.adminFullName}
                  {...register('adminFullName', { required: 'Full name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
                />
                {errors.adminFullName && <p className="text-xs text-destructive">{errors.adminFullName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adminEmail">Admin Email</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@example.com"
                  aria-invalid={!!errors.adminEmail}
                  {...register('adminEmail', { required: 'Email is required' })}
                />
                {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail.message}</p>}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Create Tenant'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
