'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertCircle, Truck, MoreHorizontal, Tags } from 'lucide-react';
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
import { useBranches } from '@/hooks/use-branches';
import { VendorDialog } from './components/vendor-dialog';
import type { Vendor } from '@medicore/shared-types';

type DialogMode = 'create' | 'edit' | null;

export default function VendorsPage() {
  const router = useRouter();
  const { vendors, isLoading, error, setStatus } = useVendors();
  const { has } = usePermissions();
  const { branches } = useBranches();
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
        id: 'branch',
        header: 'Branch',
        cell: ({ row }) => branches.find((b) => b.id === row.original.branchId)?.name ?? '—',
      },
      {
        accessorKey: 'distributorType',
        header: 'Type',
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => row.original.contactPhone || '—',
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
              <DropdownMenuItem onClick={() => router.push(`/vendors/products?vendorId=${row.original.id}`)}>
                Manage pricing
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/accounting/vendor-ledger?view=ledger&party=${row.original.id}`)}
                disabled={!has('acc_vendor_ledger:read')}
              >
                View ledger
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [has, setStatus, router, branches],
  );

  return (
    <PageAccessGuard requires="vendors:read">
      <PageHeader
        title="Vendors"
        description="Distributors and suppliers you buy products from"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/vendors/products')}>
              <Tags className="mr-2 h-4 w-4" />
              Manage Pricing
            </Button>
            <Button onClick={handleOpenCreate} disabled={!has('vendors:create')}>
              <Plus className="mr-2 h-4 w-4" />
              New Vendor
            </Button>
          </div>
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
        <DataTable
          columns={columns}
          data={vendors}
          searchPlaceholder="Search vendors..."
          onRowClick={(row) => has('vendors:update') && handleOpenEdit(row.id)}
        />
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
