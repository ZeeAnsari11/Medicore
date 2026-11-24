'use client';

import { useState } from 'react';
import { Star, Trash2, Pencil, Check, X, Package } from 'lucide-react';
import { Button, Input, Label, Badge, toast } from '@medicore/ui';
import { EmptyState } from '@/components/layout/empty-state';
import { usePermissions } from '@/hooks/use-permissions';
import type { VendorProduct, UpdateVendorProductRequest, Product } from '@medicore/shared-types';

interface VendorProductDetailPanelProps {
  link: VendorProduct | null;
  product: Product | undefined;
  update: (id: string, dto: UpdateVendorProductRequest) => Promise<VendorProduct>;
  remove: (id: string) => Promise<void>;
  onEditProduct: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function VendorProductDetailPanel({ link, product, update, remove, onEditProduct }: VendorProductDetailPanelProps) {
  const { has } = usePermissions();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceValue, setPriceValue] = useState('');
  const canUpdate = has('vendors:update');

  if (!link) {
    return (
      <EmptyState
        icon={Package}
        title="No product selected"
        description="Pick a product from the list to view or edit its details."
      />
    );
  }

  const startEdit = () => {
    setPriceValue(String(link.purchasePrice));
    setEditingPrice(true);
  };

  const saveEdit = async () => {
    const price = Number(priceValue);
    if (!priceValue || Number.isNaN(price) || price < 0) {
      toast.error('Enter a valid price');
      return;
    }
    await update(link.id, { purchasePrice: price });
    setEditingPrice(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Product Details</p>
          <Button type="button" variant="outline" size="sm" onClick={onEditProduct} disabled={!has('products:update')}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
        {product ? (
          <div className="divide-y rounded border px-3">
            <DetailRow label="Name" value={product.name} />
            <DetailRow label="Generic name" value={product.genericName || '—'} />
            <DetailRow label="Manufacturer" value={product.manufacturer?.name ?? '—'} />
            <DetailRow label="Category" value={product.category?.name ?? '—'} />
            <DetailRow label="Barcode" value={product.barcode || '—'} />
            <DetailRow label="Unit" value={product.unit} />
            <DetailRow label="Packing" value={product.packing || '—'} />
            <DetailRow label="TP (trade)" value={`Rs. ${product.tp.toFixed(2)}`} />
            <DetailRow label="CP (cost)" value={`Rs. ${product.cp.toFixed(2)}`} />
            <DetailRow label="RP (retail)" value={product.rp !== undefined ? `Rs. ${product.rp.toFixed(2)}` : '—'} />
            <DetailRow label="Min stock level" value={product.minStockLevel !== undefined ? String(product.minStockLevel) : '—'} />
            <DetailRow label="Status" value={product.status === 'ACTIVE' ? 'Active' : 'Discontinued'} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading product details...</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Vendor Details</p>
        <div className="space-y-3 rounded border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Purchase price</Label>
            {editingPrice ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  autoFocus
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void saveEdit();
                    } else if (e.key === 'Escape') {
                      setEditingPrice(false);
                    }
                  }}
                  className="h-9 w-32"
                />
                <button type="button" title="Save" onClick={() => void saveEdit()}>
                  <Check className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
                <button type="button" title="Cancel" onClick={() => setEditingPrice(false)}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                title={canUpdate ? 'Edit price' : undefined}
                onClick={() => canUpdate && startEdit()}
                disabled={!canUpdate}
                className="flex items-center gap-1.5 text-lg font-semibold tabular-nums hover:text-foreground disabled:cursor-default"
              >
                Rs. {link.purchasePrice.toFixed(2)}
                {canUpdate && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            )}
          </div>

          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Star className={link.isPreferred ? 'h-4 w-4 fill-current text-primary' : 'h-4 w-4 text-muted-foreground'} />
              Preferred vendor
            </div>
            {link.isPreferred ? (
              <Badge variant="default">Preferred</Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canUpdate}
                onClick={() => update(link.id, { isPreferred: true })}
              >
                Mark preferred
              </Button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            disabled={!canUpdate}
            onClick={() => remove(link.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove this vendor pricing
          </Button>
        </div>
      </div>
    </div>
  );
}
