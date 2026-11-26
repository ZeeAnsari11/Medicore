'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Boxes, Plus } from 'lucide-react';
import { DateRangeFilter, StatCards } from '@/components/layout/stat-cards';
import { ReportButton } from '@/components/layout/report-button';
import { useShownRows } from '@/hooks/use-shown-rows';
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

  const [range, setRange] = useState({ from: '', to: '' });
  const dated = !!(range.from || range.to);
  const { rollup, isLoading, error } = useInventory(selectedBranchId, undefined, range.from || undefined, range.to || undefined);
  const vendorsByProduct = useVendorSummary();
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const overview = useMemo(
    () => ({
      products: rollup.length,
      units: rollup.reduce((n, r) => n + Math.max(r.totalQuantity, 0), 0),
      low: rollup.filter((r) => matchesStockFilter(r, 'low')).length,
      expiring: rollup.filter((r) => matchesStockFilter(r, 'expiring')).length,
      expiredUnits: rollup.reduce((n, r) => n + (r.expiredQuantity ?? 0), 0),
      opening: rollup.reduce((n, r) => n + (r.openingQuantity ?? 0), 0),
      received: rollup.reduce((n, r) => n + (r.receivedQuantity ?? 0), 0),
      sold: rollup.reduce((n, r) => n + (r.soldQuantity ?? 0), 0),
    }),
    [rollup],
  );
  const filteredRollup = useMemo(() => rollup.filter((r) => matchesStockFilter(r, stockFilter)), [rollup, stockFilter]);
  const shown = useShownRows(filteredRollup);


  const columns = useMemo<ColumnDef<InventoryRollup>[]>(
    () => [
      { accessorKey: 'productName', header: 'Product' },
      { accessorKey: 'unit', header: 'Unit' },
      {
        id: 'vendors',
        header: 'Vendors',
        cell: ({ row }) => <VendorPriceList vendors={vendorsByProduct.get(row.original.productId) ?? []} />,
      },
      // For a period: the movement of each product, so the table is the inventory report of those dates.
      ...(range.from
        ? ([
            { accessorKey: 'openingQuantity', header: 'Opening', cell: ({ getValue }) => (getValue() as number | undefined) ?? 0 },
            { accessorKey: 'receivedQuantity', header: 'Received', cell: ({ getValue }) => (getValue() as number | undefined) ?? 0 },
            { accessorKey: 'soldQuantity', header: 'Sold', cell: ({ getValue }) => (getValue() as number | undefined) ?? 0 },
          ] as ColumnDef<InventoryRollup>[])
        : []),
      {
        accessorKey: 'totalQuantity',
        header: range.from ? 'Closing' : 'On hand',
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
      // Expiry only exists for today's batches.
      ...(dated
        ? []
        : ([
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
          ] as ColumnDef<InventoryRollup>[])),
    ],
    [vendorsByProduct, range.from, dated],
  );

  return (
    <PageAccessGuard requires="inventory:read">
      <PageHeader
        report={<ReportButton
          title="Inventory"
          summary={
            range.from
              ? [
                  ['Opening stock', overview.opening],
                  ['Received', overview.received],
                  ['Sold', overview.sold],
                  ['Closing stock', overview.units],
                  ['Low stock', overview.low],
                ]
              : [
                  ['Products', overview.products],
                  [dated ? `Units on hand at end of ${range.to}` : 'Units on hand', overview.units],
                  ['Low stock', overview.low],
                  ...(dated ? [] : ([['Expiring in 30 days', overview.expiring], ['Expired units', overview.expiredUnits]] as Array<[string, number]>)),
                ]
          }
          info={[`Stock: ${STOCK_FILTERS.find((f) => f.value === stockFilter)?.label ?? 'All stock'}`]}
          subtitle={dated ? `${range.from || 'start'} to ${range.to || 'today'}` : 'Current stock'}
          totalColumns={['On hand', 'Closing', 'Opening', 'Received', 'Sold']}
          rows={shown.rows.map((r) => ({
            Product: r.productName,
            Unit: r.unit,
            Barcode: r.barcode ?? '',
            [range.from ? 'Closing' : 'On hand']: r.totalQuantity,
            'Min stock': r.minStockLevel ?? '',
            'Low stock': r.isLowStock ? 'Yes' : '',
            ...(range.from && { Opening: r.openingQuantity ?? 0, Received: r.receivedQuantity ?? 0, Sold: r.soldQuantity ?? 0 }),
            ...(!dated && {
              'Expired units': r.expiredQuantity ?? 0,
              'Nearest expiry': r.nearestExpiryDate ? new Date(r.nearestExpiryDate).toLocaleDateString('en-CA') : '',
            }),
          }))}
        />}
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

      <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />

      {!isLoading && rollup.length > 0 && (
        <StatCards
          items={
            range.from
              ? [
                  { title: 'Opening stock', value: overview.opening, count: true, hint: `Start of ${range.from}` },
                  { title: 'Received', value: overview.received, count: true, hint: 'Purchases and added stock' },
                  { title: 'Sold', value: overview.sold, count: true },
                  { title: 'Closing stock', value: overview.units, count: true, hint: range.to ? `End of ${range.to}` : 'Today' },
                  { title: 'Low stock', value: overview.low, count: true, hint: 'Products at or below minimum' },
                ]
              : [
                  { title: 'Products in stock list', value: overview.products, count: true },
                  { title: dated ? `Units on hand at end of ${range.to}` : 'Units on hand', value: overview.units, count: true },
                  { title: 'Low stock', value: overview.low, count: true, hint: 'Products at or below minimum' },
                  ...(dated
                    ? []
                    : [
                        { title: 'Expiring in 30 days', value: overview.expiring, count: true, hint: 'Products' },
                        { title: 'Expired units', value: overview.expiredUnits, count: true, hint: 'Still on hand' },
                      ]),
                ]
          }
          note={dated ? 'Stock is rebuilt from the stock movements. Expiry details only exist for today.' : undefined}
        />
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : rollup.length === 0 ? (
        <EmptyState icon={Boxes} title="No stock yet" description="Receive a purchase or adjust stock to get started" />
      ) : (
        <DataTable
          onFilteredRowsChange={shown.onFilteredRowsChange}
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
