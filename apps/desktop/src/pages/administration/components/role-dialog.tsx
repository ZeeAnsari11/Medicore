import { useState } from 'react';
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
import { ApiError } from '@/lib/api-client';
import type { Role } from '@medicore/shared-types';

interface RoleDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  role?: Role;
  onOpenChange: (open: boolean) => void;
}

const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'manufacturers', label: 'Manufacturers' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'products', label: 'Products' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'sales', label: 'Sales' },
  { id: 'customers', label: 'Customers' },
  { id: 'reports', label: 'Reports' },
];

export function RoleDialog({ open, mode, role, onOpenChange }: RoleDialogProps) {
  console.log('RoleDialog rendered with open:', open, 'mode:', mode);
  const { create, update, isCreating, isUpdating, createError, updateError } = useRoles();

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [allowedModules, setAllowedModules] = useState<string[]>(role?.allowedModules ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isLoading = isCreating || isUpdating;
  const error = createError || updateError;

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

  const handleModuleToggle = (moduleId: string) => {
    setAllowedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  console.log('About to render Dialog with open:', open);
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
              placeholder="e.g., Salesman"
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
            <Label>Allowed Modules</Label>
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              {MODULES.map((module) => (
                <div key={module.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={module.id}
                    checked={allowedModules.includes(module.id)}
                    onCheckedChange={() => handleModuleToggle(module.id)}
                  />
                  <label htmlFor={module.id} className="text-sm cursor-pointer flex-1">
                    {module.label}
                  </label>
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
