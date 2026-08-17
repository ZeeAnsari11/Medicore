'use client';

import { useMemo, useState } from 'react';
import { Plus, AlertCircle, Truck, MoreHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Button,
  Alert,
  Badge,
  Switch,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DataTable,
  type ColumnDef,
} from '@medicore/ui';
import { useVendors } from '@/hooks/use-vendors';
import { usePermissions } from '@/hooks/use-permissions';
import { VendorDialog } from './components/vendor-dialog';
import type { Vendor } from '@medicore/shared-types';

type DialogMode = 'create' | 'edit' | null;

export default function VendorsPage() {
  const { vendors, isLoading, error, setStatus } = useVendors();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? vendors.find((v) => v.id === selectedId) : undefined;

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

  const columns = useMemo<ColumnDef<Vendor>[]>(
    () => [
      { accessorKey: 'company', header: 'Company' },
      {
        accessorKey: 'distributorType',
        header: 'Type',
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => row.original.contactEmail || row.original.contactPhone || '—',
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ getValue }) => (
          <Badge variant={getValue() ? 'default' : 'secondary'}>{getValue() ? 'Active' : 'Inactive'}</Badge>
        ),
      },
      {
        id: 'toggle',
        header: 'Active',
        cell: ({ row }) => (
          <Switch
            checked={row.original.isActive}
            onCheckedChange={() => setStatus(row.original.id, !row.original.isActive)}
            disabled={!has('vendors:update')}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 hover:bg-muted rounded">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenEdit(row.original.id)} disabled={!has('vendors:update')}>
                Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [has, setStatus],
  );

  return (
    <PageAccessGuard requires="vendors:read">
      <PageHeader
        title="Vendors"
        description="Distributors and suppliers you buy products from"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('vendors:create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Vendor
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load vendors</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : vendors.length === 0 ? (
        <EmptyState icon={Truck} title="No vendors yet" description="Add a vendor to start recording purchases" />
      ) : (
        <DataTable columns={columns} data={vendors} searchPlaceholder="Search vendors..." />
      )}

      <VendorDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        vendor={selected}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </PageAccessGuard>
  );
}
