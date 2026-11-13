import { useEffect, useState } from 'react';
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
import { usePermissionCatalog } from '@/hooks/use-permission-catalog';
import { ApiError } from '@/lib/api-client';
import type { Role } from '@medicore/shared-types';

interface RoleDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  role?: Role;
  onOpenChange: (open: boolean) => void;
}

export function RoleDialog({ open, mode, role, onOpenChange }: RoleDialogProps) {
  const { create, update, isCreating, isUpdating, createError, updateError } = useRoles();
  const { permissions } = usePermissionCatalog();

  const permissionsByModule = permissions.reduce<Record<string, typeof permissions>>((acc, permission) => {
    (acc[permission.module] ??= []).push(permission);
    return acc;
  }, {});

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [allowedModules, setAllowedModules] = useState<string[]>(role?.allowedModules ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

  useEffect(() => {
    if (open) {
      setName(role?.name ?? '');
      setDescription(role?.description ?? '');
      setAllowedModules(role?.allowedModules ?? []);
      setErrors({});
    }
  }, [open, role]);

  const handleSave = async () => {
    setErrors({});

    if (!name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }

    try {
      if (mode === 'create') {
        await create({
          name: name.trim(),
          description: description.trim() || undefined,
          allowedModules,
        });
      } else if (mode === 'edit' && role) {
        await update(role.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          allowedModules,
        });
      }
      onOpenChange(false);
      setName('');
      setDescription('');
      setAllowedModules([]);
    } catch (err) {
      console.error('Error saving role:', err);
    }
  };

  const handlePermissionToggle = (permissionKey: string) => {
    setAllowedModules((prev) =>
      prev.includes(permissionKey)
        ? prev.filter((key) => key !== permissionKey)
        : [...prev, permissionKey]
    );
  };

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

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Order Booker"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <Label>Permissions</Label>
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              {Object.entries(permissionsByModule).map(([moduleName, modulePermissions]) => (
                <div key={moduleName} className="space-y-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">{moduleName}</p>
                  {modulePermissions.map((permission) => (
                    <div key={permission.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission.key}
                        checked={allowedModules.includes(permission.key)}
                        onCheckedChange={() => handlePermissionToggle(permission.key)}
                      />
                      <label htmlFor={permission.key} className="text-sm cursor-pointer flex-1">
                        {permission.name}
                      </label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
