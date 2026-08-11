'use client';

import { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button, Alert } from '@medicore/ui';
import { useRoles } from '@/hooks/use-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { RolesTable } from './components/roles-table';
import { RoleDialog } from './components/role-dialog';

type DialogMode = 'create' | 'edit' | null;

export default function RolesPage() {
  const { roles, isLoading, error } = useRoles();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const selectedRole = selectedRoleId ? roles.find((r) => r.id === selectedRoleId) : undefined;

  const handleOpenCreate = () => {
    setSelectedRoleId(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedRoleId(id);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedRoleId(null);
  };

  return (
    <>
      <PageHeader
        title="Roles"
        description="Create and manage roles with permissions"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('roles:create')}>
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
        <RolesTable roles={roles} onEdit={handleOpenEdit} />
      )}

      <RoleDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        role={selectedRole}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </>
  );
}
