'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { AlertCircle, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  ComboboxWithCreate,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { usePurchases } from '@/hooks/use-purchases';
import { useVendors } from '@/hooks/use-vendors';
import { useProducts } from '@/hooks/use-products';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import { PaymentStatus } from '@medicore/shared-types';
import { VendorDialog } from '../../vendors/components/vendor-dialog';
import { ProductDialog } from '../../products/components/product-dialog';
import type { Product } from '@medicore/shared-types';

interface PurchaseLineFormValues {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

interface PurchaseFormValues {
  vendorId: string;
  vendorInvoiceNumber?: string;
  purchaseDate: string;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  items: PurchaseLineFormValues[];
}

function emptyLine(): PurchaseLineFormValues {
  return {
    productId: '',
    batchNumber: '',
    expiryDate: '',
    quantity: 1,
    purchasePrice: 0,
    sellingPrice: 0,
  };
}

function lineTotal(line: PurchaseLineFormValues): number {
  const subtotal = (line.quantity || 0) * (line.purchasePrice || 0);
  const discount = subtotal * ((line.discountPercent || 0) / 100);
  const taxable = subtotal - discount;
  const tax = taxable * ((line.taxPercent || 0) / 100);
  return taxable + tax;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchIdFromQuery = searchParams.get('branchId');

  const { isAdmin } = usePermissions();
  const { user } = useAuth();
  const { branches } = useBranches();
  const { vendors } = useVendors();
  const { products } = useProducts();
  const { create, isCreating, createError } = usePurchases(branchIdFromQuery);

  const branchId = branchIdFromQuery ?? (isAdmin ? null : (user?.branchId ?? null));
  const branchName = branches.find((b) => b.id === branchId)?.name;

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PurchaseFormValues>({
    defaultValues: {
      vendorId: '',
      purchaseDate: new Date().toISOString().slice(0, 10),
      paymentStatus: PaymentStatus.UNPAID,
      amountPaid: 0,
      items: [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');

  const grandTotal = items.reduce((sum, line) => sum + lineTotal(line), 0);

  const handleProductSelected = (index: number, productId: string) => {
    setValue(`items.${index}.productId`, productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${index}.purchasePrice`, product.purchasePrice);
      setValue(`items.${index}.sellingPrice`, product.salePrice);
    }
  };

  const handleProductCreated = (product: Product) => {
    if (activeLineIndex !== null) {
      handleProductSelected(activeLineIndex, product.id);
    }
    setActiveLineIndex(null);
  };

  const onSubmit = async (values: PurchaseFormValues) => {
    if (!branchId) return;
    const created = await create({
      branchId,
      vendorId: values.vendorId,
      vendorInvoiceNumber: values.vendorInvoiceNumber || undefined,
      purchaseDate: values.purchaseDate,
      paymentStatus: values.paymentStatus,
      amountPaid: Number(values.amountPaid),
      items: values.items.map((line) => ({
        productId: line.productId,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
        quantity: Number(line.quantity),
        purchasePrice: Number(line.purchasePrice),
        sellingPrice: Number(line.sellingPrice),
        discountPercent: line.discountPercent !== undefined ? Number(line.discountPercent) : undefined,
        taxPercent: line.taxPercent !== undefined ? Number(line.taxPercent) : undefined,
      })),
    });
    router.push(`/purchases?branchId=${created.branchId}`);
  };

  return (
    <PageAccessGuard requires="purchases:create">
      <button
        onClick={() => router.push('/purchases')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Purchases
      </button>

      <PageHeader
        title="New Purchase"
        description={branchName ? `Receiving stock at ${branchName}` : 'Receiving stock'}
      />

      {!branchId && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>No branch selected. Go back to Purchases and pick a branch first.</span>
        </Alert>
      )}

      {createError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{createError instanceof ApiError ? createError.message : 'Failed to create purchase'}</span>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Controller
              control={control}
              name="vendorId"
              rules={{ required: 'Vendor is required' }}
              render={({ field: { value, onChange } }) => (
                <ComboboxWithCreate
                  value={value}
                  onChange={onChange}
                  options={vendors.map((v) => ({ value: v.id, label: v.company }))}
                  placeholder="Select vendor"
                  onCreateNew={() => setVendorDialogOpen(true)}
                  createLabel={() => 'Create new vendor'}
                />
              )}
            />
            {errors.vendorId && <p className="text-xs text-destructive">{errors.vendorId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vendorInvoiceNumber">Vendor invoice #</Label>
            <Input id="vendorInvoiceNumber" placeholder="Optional" {...register('vendorInvoiceNumber')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchaseDate">Purchase date</Label>
            <Input id="purchaseDate" type="date" {...register('purchaseDate', { required: true })} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLine())}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add line
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 rounded-lg border p-3 items-end">
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Product</Label>
                  <ComboboxWithCreate
                    value={items[index]?.productId}
                    onChange={(value) => handleProductSelected(index, value)}
                    options={products.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Select product"
                    onCreateNew={() => {
                      setActiveLineIndex(index);
                      setProductDialogOpen(true);
                    }}
                    createLabel={() => 'Create new product'}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Batch #</Label>
                  <Input {...register(`items.${index}.batchNumber` as const, { required: true })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Expiry</Label>
                  <Input type="date" {...register(`items.${index}.expiryDate` as const, { required: true })} />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" {...register(`items.${index}.quantity` as const, { required: true, min: 1 })} />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">Cost</Label>
                  <Input type="number" step="0.01" {...register(`items.${index}.purchasePrice` as const, { required: true, min: 0 })} />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">Sale</Label>
                  <Input type="number" step="0.01" {...register(`items.${index}.sellingPrice` as const, { required: true, min: 0 })} />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">Disc %</Label>
                  <Input type="number" step="0.01" {...register(`items.${index}.discountPercent` as const)} />
                </div>
                <div className="col-span-1 flex items-center justify-between gap-1">
                  <span className="text-sm font-medium tabular-nums">{lineTotal(items[index] ?? emptyLine()).toFixed(2)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment status</Label>
              <Controller
                control={control}
                name="paymentStatus"
                render={({ field: { value, onChange } }) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PaymentStatus.UNPAID}>Unpaid</SelectItem>
                      <SelectItem value={PaymentStatus.PARTIAL}>Partial</SelectItem>
                      <SelectItem value={PaymentStatus.PAID}>Paid</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amountPaid">Amount paid</Label>
              <Input id="amountPaid" type="number" step="0.01" {...register('amountPaid')} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Grand total</p>
            <p className="text-2xl font-semibold tabular-nums">{grandTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/purchases')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isCreating || !branchId}>
            {isCreating ? 'Receiving...' : 'Receive Purchase'}
          </Button>
        </div>
      </form>

      <VendorDialog
        open={vendorDialogOpen}
        mode="create"
        onOpenChange={setVendorDialogOpen}
        onCreated={(vendor) => setValue('vendorId', vendor.id)}
      />
      <ProductDialog
        open={productDialogOpen}
        mode="create"
        onOpenChange={setProductDialogOpen}
        onCreated={handleProductCreated}
      />
    </PageAccessGuard>
  );
}
