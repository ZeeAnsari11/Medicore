'use client';

import { useForm } from 'react-hook-form';
import { AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label, Alert } from '@medicore/ui';
import { useCategories } from '@/hooks/use-categories';
import { ApiError } from '@/lib/api-client';
import type { Category } from '@medicore/shared-types';

interface CategoryQuickCreateDialogProps {
  open: boolean;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: Category) => void;
}

interface CategoryFormValues {
  name: string;
}

/**
 * Nested-entity-creation pattern: opened over the Product form (never a full
 * navigation), and the newly created category is handed back to the caller
 * via onCreated so it can be selected immediately in the parent form.
 */
export function CategoryQuickCreateDialog({ open, initialName, onOpenChange, onCreated }: CategoryQuickCreateDialogProps) {
  const { create, isCreating, createError } = useCategories();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({ defaultValues: { name: initialName ?? '' } });

  const onSubmit = async (values: CategoryFormValues) => {
    const created = await create(values);
    onCreated(created);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Category</DialogTitle>
        </DialogHeader>

        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{createError instanceof ApiError ? createError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="categoryName">Name</Label>
            <Input
              id="categoryName"
              placeholder="e.g., Analgesics"
              aria-invalid={!!errors.name}
              {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'Too short' } })}
              autoFocus
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
