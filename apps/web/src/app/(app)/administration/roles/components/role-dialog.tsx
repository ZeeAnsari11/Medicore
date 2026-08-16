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
} from '@medicore/ui';
import { useRoles } from '@/hooks/use-roles';
import { useAvailableModules } from '@/hooks/use-available-modules';
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
  allowedModules: string[];
}

export function RoleDialog({ open, mode, role, onOpenChange }: RoleDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useRoles();
  const { modules } = useAvailableModules();

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
      allowedModules: role?.allowedModules ?? [],
    },
  });

  const onSubmit = async (values: RoleFormValues) => {
    if (mode === 'create') {
      await create({
        name: values.name,
        description: values.description,
        allowedModules: values.allowedModules,
      });
    } else if (mode === 'edit' && role) {
      const dto: UpdateRoleRequest = {};
      if (values.name !== role.name) dto.name = values.name;
      if (values.description !== role.description) dto.description = values.description;
      dto.allowedModules = values.allowedModules;

      await update(role.id, dto);
    }
    onOpenChange(false);
    reset();
  };

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

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
            <Label>Allowed Modules</Label>
            <Controller
              control={control}
              name="allowedModules"
              render={({ field: { value, onChange } }) => (
                <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                  {modules.map((module) => (
                    <div key={module.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={module.id}
                        checked={value.includes(module.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            onChange([...value, module.id]);
                          } else {
                            onChange(value.filter((id) => id !== module.id));
                          }
                        }}
                      />
                      <label htmlFor={module.id} className="text-sm cursor-pointer">
                        {module.label}
                      </label>
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
