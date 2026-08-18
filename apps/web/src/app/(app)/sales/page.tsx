'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from '@medicore/ui';
import { useSales } from '@/hooks/use-sales';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { PaymentStatus } from '@medicore/shared-types';
import { SaleDetailDialog } from './components/sale-detail-dialog';
import type { Sale } from '@medicore/shared-types';

const ALL_BRANCHES = '__all__';

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

export default function SalesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const { branches } = useBranches();

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    isAdmin ? null : (user?.branchId ?? null),
  );
  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  const { sales, isLoading, error } = useSales(selectedBranchId);

  const currentBranchName = isAdmin
    ? null
    : (branches.find((b) => b.id === user?.branchId)?.name ?? 'Unassigned branch');

  const columns = useMemo<ColumnDef<Sale>[]>(
    () => [
      { accessorKey: 'invoiceNumber', header: 'Invoice #' },
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => row.original.customerName ?? 'Walk-in',
      },
      {
        accessorKey: 'saleDate',
        header: 'Date',
        cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString(),
      },
      {
        id: 'items',
        header: 'Items',
        cell: ({ row }) => row.original.items.length,
      },
      {
        accessorKey: 'grandTotal',
        header: 'Total',
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
      },
      {
        accessorKey: 'paymentStatus',
        header: 'Payment',
        cell: ({ getValue }) => {
          const status = getValue() as PaymentStatus;
          return <Badge variant={paymentVariant[status]}>{status}</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <PageAccessGuard requires="sales:read">
      <PageHeader
        title="Sales"
        description="Invoices sold to customers"
        actions={
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <Select
                value={selectedBranchId ?? ALL_BRANCHES}
                onValueChange={(value) => setSelectedBranchId(value === ALL_BRANCHES ? null : value)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{currentBranchName}</Badge>
            )}
            <Button
              onClick={() =>
                router.push(selectedBranchId ? `/sales/new?branchId=${selectedBranchId}` : '/sales/new')
              }
              disabled={!has('sales:create') || !selectedBranchId}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Sale
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load sales</span>
        </Alert>
      )}

      {isAdmin && !selectedBranchId && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Viewing all branches combined. Select a branch to create a sale.</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : sales.length === 0 ? (
        <EmptyState icon={Receipt} title="No sales yet" description="Create your first invoice to a customer" />
      ) : (
        <DataTable
          columns={columns}
          data={sales}
          searchPlaceholder="Search sales..."
          onRowClick={(row) => setDetailSale(row)}
        />
      )}

      {detailSale && (
        <SaleDetailDialog
          key={detailSale.id}
          open={detailSale !== null}
          onOpenChange={(open) => !open && setDetailSale(null)}
          sale={detailSale}
          branchId={selectedBranchId}
        />
      )}
    </PageAccessGuard>
  );
}
