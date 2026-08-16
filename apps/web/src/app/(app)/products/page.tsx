'use client';

import { useMemo, useState } from 'react';
import { Plus, AlertCircle, Pill, MoreHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import {
  Button,
  Alert,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DataTable,
  type ColumnDef,
} from '@medicore/ui';
import { useProducts } from '@/hooks/use-products';
import { usePermissions } from '@/hooks/use-permissions';
import { ProductStatus } from '@medicore/shared-types';
import { ProductDialog } from './components/product-dialog';
import type { Product } from '@medicore/shared-types';

type DialogMode = 'create' | 'edit' | null;

export default function ProductsPage() {
  const { products, isLoading, error, setStatus } = useProducts();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? products.find((p) => p.id === selectedId) : undefined;

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
      { accessorKey: 'unit', header: 'Unit' },
      {
        accessorKey: 'salePrice',
        header: 'Sale price',
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
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
    [has, setStatus],
  );

  return (
    <>
      <PageHeader
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
        <DataTable columns={columns} data={products} searchPlaceholder="Search products..." />
      )}

      <ProductDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        product={selected}
        onOpenChange={(open) => !open && handleCloseDialog()}
      />
    </>
  );
}
