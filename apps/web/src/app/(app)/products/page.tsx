'use client';

import { useMemo, useState } from 'react';
import { Plus, AlertCircle, Pill, MoreHorizontal, Barcode } from 'lucide-react';
import { ReportButton } from '@/components/layout/report-button';
import { useShownRows } from '@/hooks/use-shown-rows';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Button,
  Alert,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DataTable,
  Input,
  type ColumnDef,
} from '@medicore/ui';
import { useProducts } from '@/hooks/use-products';
import { useBranches } from '@/hooks/use-branches';
import { useVendorSummary } from '@/hooks/use-vendor-products';
import { VendorPriceList } from '@/components/vendor-price-list';
import { usePermissions } from '@/hooks/use-permissions';
import { ProductStatus } from '@medicore/shared-types';
import { ProductDialog } from './components/product-dialog';
import { BarcodeLabelDialog } from './components/barcode-label-dialog';
import type { Product } from '@medicore/shared-types';

type DialogMode = 'create' | 'edit' | null;

export default function ProductsPage() {
  const { products, isLoading, error, setStatus } = useProducts();
  const { has } = usePermissions();
  const { branches } = useBranches();
  const vendorsByProduct = useVendorSummary();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelProductId, setLabelProductId] = useState<string | null>(null);
  const [genericSearch, setGenericSearch] = useState('');
  const visibleProducts = useMemo(() => {
    const q = genericSearch.trim().toLowerCase();
    return q ? products.filter((p) => p.genericName?.toLowerCase().includes(q)) : products;
  }, [products, genericSearch]);
  const shown = useShownRows(visibleProducts);

  const selected = selectedId ? products.find((p) => p.id === selectedId) : undefined;
  const labelProduct = labelProductId ? (products.find((p) => p.id === labelProductId) ?? null) : null;

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

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      { accessorKey: 'name', header: 'Name' },
      {
        accessorKey: 'genericName',
        header: 'Generic name',
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
      {
        id: 'manufacturer',
        header: 'Manufacturer',
        cell: ({ row }) => row.original.manufacturer?.name || '—',
      },
      {
        id: 'branch',
        header: 'Branch',
        cell: ({ row }) => branches.find((b) => b.id === row.original.branchId)?.name ?? '—',
      },
      { accessorKey: 'unit', header: 'Unit' },
      {
        id: 'vendors',
        header: 'Vendors',
        cell: ({ row }) => <VendorPriceList vendors={vendorsByProduct.get(row.original.id) ?? []} />,
      },
      {
        accessorKey: 'tp',
        header: 'TP',
        cell: ({ getValue }) => (getValue() as number | undefined)?.toFixed(2) ?? '—',
      },
      {
        accessorKey: 'cp',
        header: 'CP',
        cell: ({ getValue }) => (getValue() as number | undefined)?.toFixed(2) ?? '—',
      },
      {
        accessorKey: 'rp',
        header: 'RP',
        cell: ({ getValue }) => (getValue() as number | undefined)?.toFixed(2) ?? '—',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as ProductStatus;
          return <Badge variant={status === ProductStatus.ACTIVE ? 'default' : 'secondary'}>{status}</Badge>;
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
              <DropdownMenuItem onClick={() => handleOpenEdit(row.original.id)} disabled={!has('products:update')}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLabelProductId(row.original.id)}>
                <Barcode className="mr-2 h-4 w-4" />
                Print barcode
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setStatus(
                    row.original.id,
                    row.original.status === ProductStatus.ACTIVE ? ProductStatus.DISCONTINUED : ProductStatus.ACTIVE,
                  )
                }
                disabled={!has('products:update')}
              >
                {row.original.status === ProductStatus.ACTIVE ? 'Discontinue' : 'Reactivate'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [has, setStatus, vendorsByProduct, branches],
  );

  return (
    <PageAccessGuard requires="products:read">
      <PageHeader
        report={<ReportButton
          title="Products"
          rows={shown.rows.map((p) => ({
            Name: p.name,
            'Generic name': p.genericName ?? '',
            Manufacturer: p.manufacturer?.name ?? '',
            Category: p.category?.name ?? '',
            Barcode: p.barcode ?? '',
            Unit: p.unit,
            TP: p.tp.toFixed(2),
            CP: p.cp.toFixed(2),
            RP: (p.rp ?? 0).toFixed(2),
            'Min stock': p.minStockLevel ?? '',
            Status: p.status,
          }))}
        />}
        title="Products"
        description="Your pharmaceutical product catalog"
        actions={
          <Button onClick={handleOpenCreate} disabled={!has('products:create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Product
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load products</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={Pill} title="No products yet" description="Add your first product to the catalog" />
      ) : (
        <DataTable
          onFilteredRowsChange={shown.onFilteredRowsChange}
          columns={columns}
          data={visibleProducts}
          searchPlaceholder="Search products..."
          toolbar={
            <Input
              placeholder="Search by generic name..."
              value={genericSearch}
              onChange={(e) => setGenericSearch(e.target.value)}
              className="max-w-sm"
            />
          }
          onRowClick={(row) => has('products:update') && handleOpenEdit(row.id)}
        />
      )}

      <ProductDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        product={selected}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />

      <BarcodeLabelDialog
        key={labelProductId ?? 'none'}
        open={labelProductId !== null}
        product={labelProduct}
        onOpenChange={(open) => !open && setLabelProductId(null)}
      />
    </PageAccessGuard>
  );
}
