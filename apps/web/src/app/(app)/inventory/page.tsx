'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Boxes, Plus } from 'lucide-react';
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
import { useInventory } from '@/hooks/use-inventory';
import { useBranches } from '@/hooks/use-branches';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { BatchDetailDialog } from './components/batch-detail-dialog';
import { AdjustmentDialog } from './components/adjustment-dialog';
import type { InventoryRollup } from '@medicore/shared-types';

const ALL_BRANCHES = '__all__';

export default function InventoryPage() {
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const { branches } = useBranches();

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    isAdmin ? null : (user?.branchId ?? null),
  );
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [detailProductName, setDetailProductName] = useState<string | undefined>();
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);

  const { rollup, isLoading, error } = useInventory(selectedBranchId);

  const currentBranchName = isAdmin
    ? null
    : (branches.find((b) => b.id === user?.branchId)?.name ?? 'Unassigned branch');

  const columns = useMemo<ColumnDef<InventoryRollup>[]>(
    () => [
      { accessorKey: 'productName', header: 'Product' },
      { accessorKey: 'unit', header: 'Unit' },
      {
        accessorKey: 'totalQuantity',
        header: 'On hand',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {row.original.totalQuantity}
            {row.original.isLowStock && <Badge variant="warning">Low stock</Badge>}
          </span>
        ),
      },
      {
        accessorKey: 'nearestExpiryDate',
        header: 'Nearest expiry',
        cell: ({ getValue }) => {
          const value = getValue() as string | undefined;
          return value ? new Date(value).toLocaleDateString() : '—';
        },
      },
    ],
    [],
  );

  return (
    <PageAccessGuard requires="inventory:read">
      <PageHeader
        title="Inventory"
        description="Batch-level stock on hand, by branch"
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
              onClick={() => setAdjustDialogOpen(true)}
              disabled={!has('inventory:adjust') || !selectedBranchId}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adjust Stock
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load inventory</span>
        </Alert>
      )}

      {isAdmin && !selectedBranchId && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Viewing all branches combined. Select a branch to adjust stock.</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : rollup.length === 0 ? (
        <EmptyState icon={Boxes} title="No stock yet" description="Receive a purchase or adjust stock to get started" />
      ) : (
        <DataTable
          columns={columns}
          data={rollup}
          searchPlaceholder="Search inventory..."
          onRowClick={(row) => {
            setDetailProductId(row.productId);
            setDetailProductName(row.productName);
          }}
        />
      )}

      <BatchDetailDialog
        open={detailProductId !== null}
        onOpenChange={(open) => !open && setDetailProductId(null)}
        productId={detailProductId}
        productName={detailProductName}
        branchId={selectedBranchId}
      />

      <AdjustmentDialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen} branchId={selectedBranchId} />
    </PageAccessGuard>
  );
}
