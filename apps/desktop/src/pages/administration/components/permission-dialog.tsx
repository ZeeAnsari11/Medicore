import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Alert,
} from '@medicore/ui';
import { usePermissionCatalog } from '@/hooks/use-permission-catalog';
import { ApiError } from '@/lib/api-client';
import type { Permission, UpdatePermissionRequest } from '@medicore/shared-types';

interface PermissionDialogProps {
  open: boolean;
  mode: 'create' | 'edit' | 'view';
  permission?: Permission;
  onOpenChange: (open: boolean) => void;
}

interface PermissionFormValues {
  key: string;
  name: string;
  description?: string;
  module: string;
}

export function PermissionDialog({
  open,
  mode,
  permission,
  onOpenChange,
}: PermissionDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = usePermissionCatalog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PermissionFormValues>({
    defaultValues: {
      key: permission?.key ?? '',
      name: permission?.name ?? '',
      description: permission?.description ?? '',
      module: permission?.module ?? '',
    },
  });

  const onSubmit = async (values: PermissionFormValues) => {
    if (mode === 'create') {
      await create({
        key: values.key,
        name: values.name,
        description: values.description,
        module: values.module,
      });
    } else if (mode === 'edit' && permission) {
      const dto: UpdatePermissionRequest = {};
      if (values.name !== permission.name) dto.name = values.name;
      if (values.description !== permission.description) dto.description = values.description;
      if (values.module !== permission.module) dto.module = values.module;

      await update({ id: permission.id, dto });
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;
  const isReadOnly = mode === 'view';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' && 'Create Permission'}
            {mode === 'edit' && 'Edit Permission'}
            {mode === 'view' && 'View Permission'}
          </DialogTitle>
          {mode === 'view' && (
            <DialogDescription>System permissions cannot be edited</DialogDescription>
          )}
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              placeholder="e.g., users:read"
              aria-invalid={!!errors.key}
              disabled={isReadOnly || mode === 'edit'}
              {...register('key', {
                required: 'Key is required',
                pattern: {
                  value: /^[a-z][a-z0-9]*(:[a-z][a-z0-9-]+)+$/,
                  message: 'Key must be like "module:action"',
                },
              })}
            />
            {errors.key && <p className="text-xs text-destructive">{errors.key.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., View users"
              aria-invalid={!!errors.name}
              disabled={isReadOnly}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              disabled={isReadOnly}
              {...register('description')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="module">Module</Label>
            <Input
              id="module"
              placeholder="e.g., Users"
              aria-invalid={!!errors.module}
              disabled={isReadOnly}
              {...register('module', { required: 'Module is required', minLength: { value: 2, message: 'Module must be at least 2 characters' } })}
            />
            {errors.module && <p className="text-xs text-destructive">{errors.module.message}</p>}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isReadOnly && (
            <Button onClick={handleSubmit(onSubmit)} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
