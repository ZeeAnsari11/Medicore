'use client';

import { useState } from 'react';
import { Star, Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import { Button, Checkbox, Input, Label, ComboboxWithCreate, Badge, toast } from '@medicore/ui';
import { useVendorProductsForProduct } from '@/hooks/use-vendor-products';
import { useVendors } from '@/hooks/use-vendors';
import { VendorDialog } from '../../vendors/components/vendor-dialog';
import type { Vendor } from '@medicore/shared-types';

interface VendorPricingSectionProps {
  productId: string;
}

export function VendorPricingSection({ productId }: VendorPricingSectionProps) {
  const { vendorProducts, isLoading, create, isCreating, update, remove } =
    useVendorProductsForProduct(productId);
  const { vendors } = useVendors();

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [newVendorId, setNewVendorId] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');

  const linkedVendorIds = new Set(vendorProducts.map((vp) => vp.vendorId));
  const availableVendors = vendors.filter((v) => !linkedVendorIds.has(v.id));

  const handleAdd = async () => {
    const price = Number(newPrice);
    if (!newVendorId || !newPrice || Number.isNaN(price) || price < 0) {
      toast.error('Pick a vendor and enter a valid price');
      return;
    }
    await create({ vendorId: newVendorId, productId, purchasePrice: price });
    setNewVendorId('');
    setNewPrice('');
  };

  const startEditPrice = (vpId: string, currentPrice: number) => {
    setEditingId(vpId);
    setEditPrice(String(currentPrice));
  };

  const cancelEditPrice = () => {
    setEditingId(null);
    setEditPrice('');
  };

  const saveEditPrice = async (vpId: string) => {
    const price = Number(editPrice);
    if (!editPrice || Number.isNaN(price) || price < 0) {
      toast.error('Enter a valid price');
      return;
    }
    await update(vpId, { purchasePrice: price });
    setEditingId(null);
    setEditPrice('');
  };

  const handleVendorCreated = (vendor: Vendor) => {
    setNewVendorId(vendor.id);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label>Vendor pricing</Label>
      <p className="text-xs text-muted-foreground">
        Vendors that sell this product, and what each one charges.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : vendorProducts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vendors linked yet.</p>
      ) : (
        <div className="space-y-1">
          {vendorProducts.map((vp) => (
            <div
              key={vp.id}
              className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm ${vp.isActive ? '' : 'opacity-60'}`}
            >
              <span className="flex-1 truncate">{vp.vendor?.company ?? vp.vendorId}</span>
              {editingId === vp.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    autoFocus
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveEditPrice(vp.id);
                      } else if (e.key === 'Escape') {
                        cancelEditPrice();
                      }
                    }}
                    className="h-7 w-20 text-sm"
                  />
                  <button type="button" title="Save" onClick={() => saveEditPrice(vp.id)} className="shrink-0">
                    <Check className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button type="button" title="Cancel" onClick={cancelEditPrice} className="shrink-0">
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  title="Edit price"
                  onClick={() => startEditPrice(vp.id, vp.purchasePrice)}
                  className="flex shrink-0 items-center gap-1 tabular-nums hover:text-foreground"
                >
                  {vp.purchasePrice.toFixed(2)}
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              <button
                type="button"
                title={vp.isPreferred ? 'Preferred vendor' : 'Mark as preferred'}
                onClick={() => !vp.isPreferred && update(vp.id, { isPreferred: true })}
                className="shrink-0"
              >
                {vp.isPreferred ? (
                  <Badge variant="default" className="gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    Preferred
                  </Badge>
                ) : (
                  <Star className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                )}
              </button>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Checkbox checked={vp.isActive} onCheckedChange={(v) => update(vp.id, { isActive: v === true })} />
                Active
              </label>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(vp.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 pt-1">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Vendor</Label>
          <ComboboxWithCreate
            value={newVendorId}
            onChange={setNewVendorId}
            options={availableVendors.map((v) => ({ value: v.id, label: v.company }))}
            placeholder="Select vendor"
            onCreateNew={() => setVendorDialogOpen(true)}
            createLabel={() => 'Create new vendor'}
          />
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-xs">Price</Label>
          <Input type="number" step="0.01" min={0} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={isCreating}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <VendorDialog
        open={vendorDialogOpen}
        mode="create"
        onOpenChange={setVendorDialogOpen}
        onCreated={handleVendorCreated}
      />
    </div>
  );
}
