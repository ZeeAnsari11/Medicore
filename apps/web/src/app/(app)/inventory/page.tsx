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
import { useVendorSummary } from '@/hooks/use-vendor-products';
import { VendorPriceList } from '@/components/vendor-price-list';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { usePermissions } from '@/hooks/use-permissions';
import { BatchDetailDialog } from './components/batch-detail-dialog';
import { expiryBadge } from './components/batch-detail-dialog';
import { AdjustmentDialog } from './components/adjustment-dialog';
import type { InventoryRollup } from '@medicore/shared-types';


type StockFilter = 'all' | 'in-stock' | 'low' | 'out' | 'expired' | 'expiring';

const STOCK_FILTERS: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'All stock' },
  { value: 'in-stock', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'expired', label: 'Has expired stock' },
  { value: 'expiring', label: 'Expiring in 30 days' },
];

const DAY_MS = 86_400_000;

const matchesStockFilter = (r: InventoryRollup, filter: StockFilter) => {
  switch (filter) {
    case 'in-stock':
      return r.totalQuantity > 0;
    case 'low':
      return r.isLowStock;
    case 'out':
      return r.totalQuantity <= 0;
    case 'expired':
      return !!r.expiredQuantity;
    case 'expiring': {
      if (!r.nearestExpiryDate) return false;
      const days = (new Date(r.nearestExpiryDate).getTime() - Date.now()) / DAY_MS;
      return days >= 0 && days <= 30;
    }
    default:
      return true;
  }
};

export default function InventoryPage() {
  const { has } = usePermissions();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [detailProductName, setDetailProductName] = useState<string | undefined>();
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);

  const { rollup, isLoading, error } = useInventory(selectedBranchId);
  const vendorsByProduct = useVendorSummary();
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const filteredRollup = useMemo(() => rollup.filter((r) => matchesStockFilter(r, stockFilter)), [rollup, stockFilter]);


  const columns = useMemo<ColumnDef<InventoryRollup>[]>(
    () => [
      { accessorKey: 'productName', header: 'Product' },
      { accessorKey: 'unit', header: 'Unit' },
      {
        id: 'vendors',
        header: 'Vendors',
        cell: ({ row }) => <VendorPriceList vendors={vendorsByProduct.get(row.original.productId) ?? []} />,
      },
      {
        accessorKey: 'totalQuantity',
        header: 'On hand',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {row.original.totalQuantity}
            {row.original.isLowStock && <Badge variant="warning">Low stock</Badge>}
            {!!row.original.expiredQuantity && (
              <Badge variant="destructive">{row.original.expiredQuantity} expired</Badge>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'nearestExpiryDate',
        header: 'Nearest expiry',
        cell: ({ getValue }) => {
          const value = getValue() as string | undefined;
          if (!value) return '—';
          return (
            <span className="flex items-center gap-2">
              {new Date(value).toLocaleDateString()}
              {expiryBadge(value)}
            </span>
          );
        },
      },
    ],
    [vendorsByProduct],
  );

  return (
    <PageAccessGuard requires="inventory:read">
      <PageHeader
        title="Inventory"
        description="Batch-level stock on hand, by branch"
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setAdjustDialogOpen(true)}
              disabled={!has('inventory:adjust')}
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

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : rollup.length === 0 ? (
        <EmptyState icon={Boxes} title="No stock yet" description="Receive a purchase or adjust stock to get started" />
      ) : (
        <DataTable
          columns={columns}
          data={filteredRollup}
          searchPlaceholder="Search inventory..."
          pageSizeOptions={[10, 25, 50, 100, 250, 500]}
          filtersActive={stockFilter !== 'all'}
          onClearFilters={() => setStockFilter('all')}
          toolbar={
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockFilter)}>
              <SelectTrigger className="w-52" aria-label="Stock status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
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
