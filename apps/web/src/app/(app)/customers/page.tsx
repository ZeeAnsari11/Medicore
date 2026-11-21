'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, MoreHorizontal, Plus, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  toast,
  type ColumnDef,
} from '@medicore/ui';
import { useCustomers } from '@/hooks/use-customers';
import { useLocations } from '@/hooks/use-locations';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import { MultiSelect } from '@/components/ssr/multi-select';
import { CustomerDialog } from './components/customer-dialog';
import type { Customer } from '@medicore/shared-types';

type DialogMode = 'create' | 'edit' | null;

export default function CustomersPage() {
  const { customers, isLoading, error, delete: deleteCustomer, isDeleting } = useCustomers();
  const router = useRouter();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const locations = useLocations();
  const [cities, setCities] = useState<string[]>([]);
  const [territories, setTerritories] = useState<string[]>([]);

  const distinct = (pick: (c: Customer) => string | undefined) =>
    [...new Set(customers.map((c) => pick(c)?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  // The shared lists (active ones), plus any spelling a customer still has that is not in them.
  const merged = (listed: string[], used: string[]) =>
    [...new Set([...listed, ...used])].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  const cityOptions = useMemo(
    () => merged(locations.cities.filter((c) => c.isActive).map((c) => c.name), distinct((c) => c.city)),
    [customers, locations.cities], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const territoryOptions = useMemo(
    () => merged(locations.territories.filter((t) => t.isActive).map((t) => t.name), distinct((c) => c.territory)),
    [customers, locations.territories], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visible = useMemo(
    () =>
      customers.filter(
        (c) => (cities.length === 0 || cities.includes(c.city?.trim() ?? '')) && (territories.length === 0 || territories.includes(c.territory?.trim() ?? '')),
      ),
    [customers, cities, territories],
  );

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined;

  const handleOpenCreate = () => {
    setSelectedId(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedId(id);
    setDialogMode('edit');
  };

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this customer?')) {
      try {
        await deleteCustomer(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error(err.message);
        }
      }
    }
  }, [deleteCustomer]);

  const columns = useMemo<ColumnDef<Customer>[]>(
    () => [
      { accessorKey: 'name', header: 'Name' },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => row.original.phone || '—',
      },
      { id: 'address', header: 'Address', accessorFn: (c) => c.address ?? '', cell: ({ getValue }) => (getValue() as string) || '—' },
      { id: 'territory', header: 'Territory', accessorFn: (c) => c.territory ?? '', cell: ({ getValue }) => (getValue() as string) || '—' },
      { id: 'city', header: 'City', accessorFn: (c) => c.city ?? '', cell: ({ getValue }) => (getValue() as string) || '—' },
      {
        accessorKey: 'isDealer',
        header: 'Type',
        cell: ({ getValue }) => (getValue() ? <Badge variant="outline">Dealer</Badge> : 'Retail'),
      },
      {
        accessorKey: 'outstandingBalance',
        header: 'Outstanding',
        cell: ({ getValue }) => {
          const due = (getValue() as number | undefined) ?? 0;
          return due > 0.01 ? <Badge variant="warning">{due.toFixed(2)}</Badge> : due.toFixed(2);
        },
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
              <DropdownMenuItem onClick={() => handleOpenEdit(row.original.id)} disabled={!has('customers:update')}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/accounting/customer-ledger?view=ledger&party=${row.original.id}`)}
                disabled={!has('acc_customer_ledger:read')}
              >
                View ledger
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDelete(row.original.id)}
                disabled={!has('customers:delete') || isDeleting}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [has, isDeleting, handleDelete],
  );

  return (
    <PageAccessGuard requires="customers:read">
      <PageHeader
        title="Customers"
        description="Customer records and outstanding balances"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('customers:create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Customer
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load customers</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" description="Add a customer to start recording sales" />
      ) : (
        <DataTable
          columns={columns}
          data={visible}
          toolbar={
            <div className="flex flex-wrap gap-2">
              <MultiSelect label="City" allLabel="All cities" options={cityOptions} value={cities} onChange={setCities} />
              <MultiSelect label="Territory" allLabel="All territories" options={territoryOptions} value={territories} onChange={setTerritories} />
            </div>
          }
          filtersActive={cities.length > 0 || territories.length > 0}
          onClearFilters={() => {
            setCities([]);
            setTerritories([]);
          }}
          searchPlaceholder="Search customers..."
          onRowClick={(row) => has('customers:update') && handleOpenEdit(row.id)}
        />
      )}

      {dialogMode && (
        <CustomerDialog
          key={selectedId ?? 'new'}
          open={dialogMode !== null}
          mode={dialogMode}
          customer={selected}
          onOpenChange={(open) => {
            if (!open) {
              setDialogMode(null);
              setSelectedId(null);
            }
          }}
        />
      )}
    </PageAccessGuard>
  );
}
