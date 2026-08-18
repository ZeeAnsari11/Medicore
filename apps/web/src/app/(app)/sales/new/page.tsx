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
import { useSales } from '@/hooks/use-sales';
import { useCustomers } from '@/hooks/use-customers';
import { useProducts } from '@/hooks/use-products';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import { PaymentMethod, PaymentStatus } from '@medicore/shared-types';
import { CustomerDialog } from '../../customers/components/customer-dialog';
import { ProductDialog } from '../../products/components/product-dialog';
import type { Customer, Product } from '@medicore/shared-types';

interface SaleLineFormValues {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

interface SaleFormValues {
  customerId?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  items: SaleLineFormValues[];
}

function emptyLine(): SaleLineFormValues {
  return { productId: '', quantity: 1, unitPrice: 0 };
}

function lineTotal(line: SaleLineFormValues): number {
  const subtotal = (line.quantity || 0) * (line.unitPrice || 0);
  const discount = subtotal * ((line.discountPercent || 0) / 100);
  const taxable = subtotal - discount;
  const tax = taxable * ((line.taxPercent || 0) / 100);
  return taxable + tax;
}

export default function NewSalePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchIdFromQuery = searchParams.get('branchId');

  const { isAdmin } = usePermissions();
  const { user } = useAuth();
  const { branches } = useBranches();
  const { customers } = useCustomers();
  const { products } = useProducts();
  const { create, isCreating, createError } = useSales(branchIdFromQuery);

  const branchId = branchIdFromQuery ?? (isAdmin ? null : (user?.branchId ?? null));
  const branchName = branches.find((b) => b.id === branchId)?.name;

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
  } = useForm<SaleFormValues>({
    defaultValues: {
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: PaymentStatus.PAID,
      amountPaid: 0,
      items: [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = watch('items');
  const customerId = watch('customerId');

  const grandTotal = items.reduce((sum, line) => sum + lineTotal(line), 0);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  const handleProductSelected = (index: number, productId: string) => {
    setValue(`items.${index}.productId`, productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      const price = selectedCustomer?.isDealer && product.dealerPrice !== undefined ? product.dealerPrice : product.salePrice;
      setValue(`items.${index}.unitPrice`, price);
    }
  };

  const handleProductCreated = (product: Product) => {
    if (activeLineIndex !== null) {
      handleProductSelected(activeLineIndex, product.id);
    }
    setActiveLineIndex(null);
  };

  const handleCustomerCreated = (customer: Customer) => {
    setValue('customerId', customer.id);
  };

  const onSubmit = async (values: SaleFormValues) => {
    if (!branchId) return;
    const created = await create({
      branchId,
      customerId: values.customerId || undefined,
      paymentMethod: values.paymentMethod,
      paymentStatus: values.paymentStatus,
      amountPaid: Number(values.amountPaid),
      items: values.items.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountPercent: line.discountPercent !== undefined ? Number(line.discountPercent) : undefined,
        taxPercent: line.taxPercent !== undefined ? Number(line.taxPercent) : undefined,
      })),
    });
    router.push(`/sales?branchId=${created.branchId}`);
  };

  return (
    <PageAccessGuard requires="sales:create">
      <button
        onClick={() => router.push('/sales')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sales
      </button>

      <PageHeader title="New Sale" description={branchName ? `Selling from ${branchName}` : 'Selling'} />

      {!branchId && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>No branch selected. Go back to Sales and pick a branch first.</span>
        </Alert>
      )}

      {createError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{createError instanceof ApiError ? createError.message : 'Failed to create sale'}</span>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Controller
              control={control}
              name="customerId"
              render={({ field: { value, onChange } }) => (
                <ComboboxWithCreate
                  value={value}
                  onChange={onChange}
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Walk-in (no customer)"
                  onCreateNew={() => setCustomerDialogOpen(true)}
                  createLabel={() => 'Create new customer'}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Controller
              control={control}
              name="paymentMethod"
              render={({ field: { value, onChange } }) => (
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PaymentMethod.CASH}>Cash</SelectItem>
                    <SelectItem value={PaymentMethod.CARD}>Card</SelectItem>
                    <SelectItem value={PaymentMethod.CREDIT}>Credit</SelectItem>
                    <SelectItem value={PaymentMethod.BANK_TRANSFER}>Bank transfer</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
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
                <div className="col-span-4 space-y-1">
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
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" {...register(`items.${index}.quantity` as const, { required: true, min: 1 })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Unit price</Label>
                  <Input type="number" step="0.01" {...register(`items.${index}.unitPrice` as const, { required: true, min: 0 })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Disc %</Label>
                  <Input type="number" step="0.01" {...register(`items.${index}.discountPercent` as const)} />
                </div>
                <div className="col-span-2 flex items-center justify-between gap-1">
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
          <p className="text-xs text-muted-foreground">
            Stock is allocated first-expiry-first-out automatically across whichever batches cover each line.
          </p>
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
          <Button type="button" variant="outline" onClick={() => router.push('/sales')}>
            Cancel
          </Button>
          <Button type="submit" disabled={isCreating || !branchId}>
            {isCreating ? 'Selling...' : 'Complete Sale'}
          </Button>
        </div>
      </form>

      <CustomerDialog
        open={customerDialogOpen}
        mode="create"
        onOpenChange={setCustomerDialogOpen}
        onCreated={handleCustomerCreated}
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
