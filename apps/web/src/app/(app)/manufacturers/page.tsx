'use client';

import { useState } from 'react';
import { Plus, AlertCircle, Factory } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Button, Alert, Input } from '@medicore/ui';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { ManufacturersTable } from './components/manufacturers-table';
import { ManufacturerDialog } from './components/manufacturer-dialog';

type DialogMode = 'create' | 'edit' | null;

export default function ManufacturersPage() {
  const { manufacturers, isLoading, error } = useManufacturers();
  const { has } = usePermissions();
  const branchFilter = useBranchFilter();
  const [search, setSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A specific branch shows only its own manufacturers; legacy ones with no branch appear under "All branches".
  const visible = manufacturers.filter(
    (m) =>
      (!branchFilter.branchId || m.branchId === branchFilter.branchId) &&
      m.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const selected = selectedId ? manufacturers.find((m) => m.id === selectedId) : undefined;

  const handleOpenCreate = () => {
    setSelectedId(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedId(id);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedId(null);
  };

  return (
    <PageAccessGuard requires="manufacturers:read">
      <PageHeader
        title="Manufacturers"
        description="Companies that make the products you distribute"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('manufacturers:create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Manufacturer
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load manufacturers</span>
        </Alert>
      )}

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manufacturers..."
          className="max-w-xs"
          aria-label="Search manufacturers"
        />
      </div>

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : manufacturers.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No manufacturers yet"
          description="Add the companies that make your products before adding products"
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Factory} title="No matching manufacturers" description="Try a different search or branch" />
      ) : (
        <ManufacturersTable manufacturers={visible} onEdit={handleOpenEdit} />
      )}

      <ManufacturerDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        manufacturer={selected}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </PageAccessGuard>
  );
}
