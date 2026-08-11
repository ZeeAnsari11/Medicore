import { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button, Alert } from '@medicore/ui';
import { usePermissionCatalog } from '@/hooks/use-permission-catalog';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionsTable } from './components/permissions-table';
import { PermissionDialog } from './components/permission-dialog';

type DialogMode = 'create' | 'edit' | 'view' | null;

function PermissionsPage() {
  const { permissions, isLoading, error } = usePermissionCatalog();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedPermissionId, setSelectedPermissionId] = useState<string | null>(null);

  const selectedPermission = selectedPermissionId
    ? permissions.find((p) => p.id === selectedPermissionId)
    : undefined;

  const handleOpenCreate = () => {
    setSelectedPermissionId(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedPermissionId(id);
    setDialogMode('edit');
  };

  const handleOpenView = (id: string) => {
    setSelectedPermissionId(id);
    setDialogMode('view');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedPermissionId(null);
  };

  return (
    <>
      <PageHeader
        title="Permissions"
        description="Manage permissions and assign them to roles"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('permissions:create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Permission
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load permissions</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : permissions.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No permissions yet"
          description="Permissions will appear here once they are created"
        />
      ) : (
        <PermissionsTable
          permissions={permissions}
          onEdit={handleOpenEdit}
          onView={handleOpenView}
        />
      )}

      <PermissionDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        permission={selectedPermission}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </>
  );
}

export default PermissionsPage;
