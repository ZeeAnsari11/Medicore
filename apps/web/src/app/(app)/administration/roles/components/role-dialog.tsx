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
  Checkbox,
  Badge,
} from '@medicore/ui';
import { useRoles } from '@/hooks/use-roles';
import { usePermissionCatalog } from '@/hooks/use-permission-catalog';
import { ApiError } from '@/lib/api-client';
import type { Role, UpdateRoleRequest } from '@medicore/shared-types';

interface RoleDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  role?: Role;
  onOpenChange: (open: boolean) => void;
}

interface RoleFormValues {
  name: string;
  description?: string;
  permissionIds: string[];
}

export function RoleDialog({ open, mode, role, onOpenChange }: RoleDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useRoles();
  const { permissions } = usePermissionCatalog();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RoleFormValues>({
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissionIds: role?.permissions.map((p) => p.id) ?? [],
    },
  });

  const onSubmit = async (values: RoleFormValues) => {
    if (mode === 'create') {
      await create({
        name: values.name,
        description: values.description,
        permissionIds: values.permissionIds,
      });
    } else if (mode === 'edit' && role) {
      const dto: UpdateRoleRequest = {};
      if (values.name !== role.name) dto.name = values.name;
      if (values.description !== role.description) dto.description = values.description;
      dto.permissionIds = values.permissionIds;

      await update({ id: role.id, dto });
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

  // Group permissions by module
  const permissionsByModule = permissions.reduce(
    (acc, perm) => {
      if (!acc[perm.module]) acc[perm.module] = [];
      acc[perm.module].push(perm);
      return acc;
    },
    {} as Record<string, typeof permissions>,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create Role' : 'Edit Role'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Inventory Manager"
              aria-invalid={!!errors.name}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              {...register('description')}
            />
          </div>

          <div className="space-y-4">
            <Label>Permissions</Label>
            <Controller
              control={control}
              name="permissionIds"
              render={({ field: { value, onChange } }) => (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/30 max-h-64 overflow-y-auto">
                  {Object.entries(permissionsByModule).map(([module, perms]) => (
                    <div key={module}>
                      <h4 className="font-medium mb-3 sticky top-0 bg-background/80 p-1">{module}</h4>
                      <div className="space-y-2 ml-2">
                        {perms.map((perm) => (
                          <div key={perm.id} className="flex items-start space-x-2">
                            <Checkbox
                              id={perm.id}
                              checked={value.includes(perm.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  onChange([...value, perm.id]);
                                } else {
                                  onChange(value.filter((id) => id !== perm.id));
                                }
                              }}
                              disabled={!perm.isActive}
                            />
                            <div className="flex-1 flex items-center justify-between">
                              <label htmlFor={perm.id} className="text-sm cursor-pointer">
                                {perm.name}
                              </label>
                              {!perm.isActive && (
                                <Badge variant="outline" className="text-[10px]">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />
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
