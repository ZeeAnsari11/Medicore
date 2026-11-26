'use client';

import { useState } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { ReportButton } from '@/components/layout/report-button';
import { useShownRows } from '@/hooks/use-shown-rows';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Button, Alert } from '@medicore/ui';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { BranchesTable } from './components/branches-table';
import { BranchDialog } from './components/branch-dialog';

type DialogMode = 'create' | 'edit' | null;

export default function BranchesPage() {
  const { branches, isLoading, error } = useBranches();
  const shown = useShownRows(branches);
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  const selectedBranch = selectedBranchId ? branches.find((b) => b.id === selectedBranchId) : undefined;

  const handleOpenCreate = () => {
    setSelectedBranchId(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedBranchId(id);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedBranchId(null);
  };

  return (
    <PageAccessGuard requires="branches:read">
      <PageHeader
        report={<ReportButton
          title="Branches"
          rows={shown.rows.map((b) => ({
            Name: b.name,
            Code: b.code,
            Address: b.address ?? '',
            Phone: b.phone ?? '',
            Main: b.isMain ? 'Yes' : '',
            Status: b.isActive ? 'Active' : 'Inactive',
          }))}
        />}
        title="Branches"
        description="Manage your organization's branches and warehouses"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('branches:create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Branch
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load branches</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : branches.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No branches yet"
          description="Create your first branch to start tracking branch-level inventory"
        />
      ) : (
        <BranchesTable branches={branches} onEdit={handleOpenEdit} onFilteredRowsChange={shown.onFilteredRowsChange} />
      )}

      <BranchDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        branch={selectedBranch}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </PageAccessGuard>
  );
}
