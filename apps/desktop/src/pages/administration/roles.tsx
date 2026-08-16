import { useState, useEffect } from 'react';
import { Plus, AlertCircle, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button, Alert } from '@medicore/ui';
import { useRoles } from '@/hooks/use-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { RolesTable } from './components/roles-table';
import { apiFetch } from '@/lib/api-client';

interface Module {
  id: string;
  label: string;
}

function RolesPage() {
  const { roles, isLoading, error, create, update } = useRoles();
  const { isAdmin } = usePermissions();

  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [availableModules, setAvailableModules] = useState<Module[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch available modules when modal opens
  useEffect(() => {
    if (showDialog) {
      fetchAvailableModules();
    }
  }, [showDialog]);

  const fetchAvailableModules = async () => {
    try {
      const modules = await apiFetch<Module[]>('/roles/modules/available', { auth: false });
      setAvailableModules(modules);
    } catch (err) {
      console.error('Failed to load modules:', err);
      setSaveError('Failed to load available modules');
    }
  };

  const handleOpenCreate = () => {
    setDialogMode('create');
    setSelectedRoleId(null);
    setRoleName('');
    setRoleDescription('');
    setSelectedModules([]);
    setSaveError(null);
    setShowDialog(true);
  };

  const handleOpenEdit = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (role) {
      setDialogMode('edit');
      setSelectedRoleId(roleId);
      setRoleName(role.name);
      setRoleDescription(role.description || '');
      setSelectedModules(role.allowedModules || []);
      setSaveError(null);
      setShowDialog(true);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setDialogMode(null);
    setSelectedRoleId(null);
    setRoleName('');
    setRoleDescription('');
    setSelectedModules([]);
    setSaveError(null);
  };

  const handleModuleToggle = (moduleId: string) => {
    setSelectedModules((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleSaveRole = async () => {
    if (!roleName.trim()) {
      setSaveError('Role name is required');
      return;
    }

    if (selectedModules.length === 0) {
      setSaveError('Please select at least one module');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (dialogMode === 'create') {
        await create({
          name: roleName.trim(),
          description: roleDescription.trim(),
          allowedModules: selectedModules,
        });
      } else if (dialogMode === 'edit' && selectedRoleId) {
        await update(selectedRoleId, {
          name: roleName.trim(),
          description: roleDescription.trim(),
          allowedModules: selectedModules,
        });
      }
      handleCloseDialog();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save role');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative">
      <PageHeader
        title="Roles"
        description="Create and manage roles with permissions"
        actions={
          <Button
            type="button"
            onClick={handleOpenCreate}
            disabled={!isAdmin}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Role
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load roles</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No roles yet"
          description="Create your first role to assign permissions to users"
        />
      ) : (
        <RolesTable
          roles={roles}
          onEdit={handleOpenEdit}
        />
      )}

      {/* Create Role Modal */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseDialog();
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {dialogMode === 'create' ? 'Create Role' : 'Edit Role'}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {dialogMode === 'create'
                    ? 'Create a role and assign module permissions.'
                    : 'Update role name and module permissions.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseDialog}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error message */}
            {saveError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <span>{saveError}</span>
              </Alert>
            )}

            {/* Form */}
            <div className="space-y-4">
              {/* Role Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Role Name *
                </label>
                <input
                  type="text"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g., Sales Staff, Account Manager"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="Optional description for this role"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                />
              </div>

              {/* Modules */}
              <div>
                <label className="block text-sm font-medium mb-3">
                  Modules & Permissions *
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-300 rounded-md p-3 dark:border-slate-700">
                  {availableModules.length === 0 ? (
                    <p className="text-sm text-gray-500">Loading modules...</p>
                  ) : (
                    availableModules.map((module) => (
                      <label key={module.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedModules.includes(module.id)}
                          onChange={() => handleModuleToggle(module.id)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm">{module.label}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Selected: {selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={isSaving}
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleSaveRole}
                disabled={isSaving}
              >
                {isSaving
                  ? dialogMode === 'create'
                    ? 'Creating...'
                    : 'Saving...'
                  : dialogMode === 'create'
                  ? 'Create Role'
                  : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RolesPage;