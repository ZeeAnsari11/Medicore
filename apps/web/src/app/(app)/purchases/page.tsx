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
import { usePurchases } from '@/hooks/use-purchases';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { PaymentStatus, PurchaseStatus } from '@medicore/shared-types';
import { PurchaseDetailDialog } from './components/purchase-detail-dialog';
import type { Purchase } from '@medicore/shared-types';

const ALL_BRANCHES = '__all__';

const paymentVariant: Record<PaymentStatus, 'default' | 'secondary' | 'warning'> = {
  PAID: 'default',
  PARTIAL: 'warning',
  UNPAID: 'secondary',
};

export default function PurchasesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const { branches } = useBranches();

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    isAdmin ? null : (user?.branchId ?? null),
  );
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);

  const { purchases, isLoading, error } = usePurchases(selectedBranchId);

  const currentBranchName = isAdmin
    ? null
    : (branches.find((b) => b.id === user?.branchId)?.name ?? 'Unassigned branch');

  const columns = useMemo<ColumnDef<Purchase>[]>(
    () => [
      { accessorKey: 'purchaseNumber', header: 'PO #' },
      {
        id: 'vendor',
        header: 'Vendor',
        cell: ({ row }) => row.original.vendorName ?? '—',
      },
      {
        accessorKey: 'purchaseDate',
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
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as PurchaseStatus;
          return <Badge variant={status === PurchaseStatus.CANCELLED ? 'destructive' : 'default'}>{status}</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <PageAccessGuard requires="purchases:read">
      <PageHeader
        title="Purchases"
        description="Stock received from vendors"
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
                router.push(selectedBranchId ? `/purchases/new?branchId=${selectedBranchId}` : '/purchases/new')
              }
              disabled={!has('purchases:create') || !selectedBranchId}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Purchase
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load purchases</span>
        </Alert>
      )}

      {isAdmin && !selectedBranchId && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Viewing all branches combined. Select a branch to create a purchase.</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : purchases.length === 0 ? (
        <EmptyState icon={Receipt} title="No purchases yet" description="Receive your first purchase from a vendor" />
      ) : (
        <DataTable
          columns={columns}
          data={purchases}
          searchPlaceholder="Search purchases..."
          onRowClick={(row) => setDetailPurchase(row)}
        />
      )}

      {detailPurchase && (
        <PurchaseDetailDialog
          key={detailPurchase.id}
          open={detailPurchase !== null}
          onOpenChange={(open) => !open && setDetailPurchase(null)}
          purchase={detailPurchase}
          branchId={selectedBranchId}
        />
      )}
    </PageAccessGuard>
  );
}
