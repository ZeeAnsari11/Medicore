'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { AlertCircle, ArrowLeft } from 'lucide-react';
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
import { TopbarContent } from '@/components/layout/topbar-slot';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { useOrderBookers, useSales } from '@/hooks/use-sales';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useCustomers } from '@/hooks/use-customers';
import { useProducts } from '@/hooks/use-products';
import { useBranchField } from '@/hooks/use-branch-field';
import { useBranches } from '@/hooks/use-branches';
import { ApiError } from '@/lib/api-client';
import { PaymentMethod, PaymentStatus } from '@medicore/shared-types';
import { CustomerDialog } from '../../customers/components/customer-dialog';
import { SaleEntryRow, type EditTarget } from './sale-entry-row';
import { SaleLinesList } from './sale-lines-list';
import { lineTotal, usedByBatch, type SaleLine } from './sale-line-utils';
import type { Customer, Sale } from '@medicore/shared-types';

interface SaleFormValues {
  customerId?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
}

/** Lines of an existing sale, one per batch allocation; allocations of one item share a groupId. */
function linesFromSale(sale: Sale): SaleLine[] {
  return sale.items.flatMap((item, index) =>
    item.batchAllocations.map((allocation) => ({
      key: `${index}-${allocation.batchId}`,
      groupId: `existing-${index}`,
      productId: item.productId,
      productName: item.productName,
      batchId: allocation.batchId,
      batchNumber: allocation.batchNumber,
      quantity: allocation.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      taxPercent: item.taxPercent,
    })),
  );
}

/** The New Sale screen, or (with `editSale`) the same screen prefilled to edit an unpaid sale. */
export function SaleFormPage({ editSale }: { editSale?: Sale }) {
  const router = useRouter();

  const { branches, isLoading: branchesLoading } = useBranches();
  const branchField = useBranchField();
  // The sale's branch is this form's own field (defaults to the main branch, locked for branch users), never the top bar.
  const [pickedBranch, setPickedBranch] = useState(editSale?.branchId ?? '');
  const mainBranchId = (branches.find((b) => b.isMain) ?? branches[0])?.id;
  const branchId = editSale?.branchId ?? (pickedBranch || branchField.defaultBranchId || mainBranchId || null);
  // Products are per branch: the picker lists the sale's own branch, not the top-bar one.
  const { user } = useAuth();
  const { has } = usePermissions();
  // Order Booker: whoever placed the sale. Everyone defaults to themselves; only people allowed to book for
  // others get a select. The server stamps the name from the user record, so only the id is ever sent.
  const canPickBooker = has('sales:book_for_others');
  const { orderBookers } = useOrderBookers(editSale ? null : branchId, !editSale);
  const [pickedBooker, setPickedBooker] = useState('');
  const ownId = user?.userId ?? '';
  const orderBookerId =
    pickedBooker && orderBookers.some((o) => o.id === pickedBooker) ? pickedBooker : ownId;
  const orderBookerName = editSale
    ? editSale.orderBookerName
    : (orderBookers.find((o) => o.id === orderBookerId)?.name ?? user?.fullName ?? '');
  const { customers } = useCustomers(undefined, branchId);
  const { products } = useProducts({ branchId });
  const { create, isCreating, createError, update, isUpdating, updateError } = useSales(branchId);
  const isEdit = !!editSale;
  const isSaving = isCreating || isUpdating;
  const saveError = isEdit ? updateError : createError;
  // The original sale's stock counts as available again while it is being edited.
  const restoreByBatch = useMemo(() => usedByBatch(editSale ? linesFromSale(editSale) : []), [editSale]);

  const branchName = branches.find((b) => b.id === branchId)?.name;

  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [lines, setLines] = useState<SaleLine[]>(() => (editSale ? linesFromSale(editSale) : []));
  const [editing, setEditing] = useState<EditTarget | null>(null);
  // Bumped after each completed sale to remount the entry row (clears it and refocuses Product).
  const [resetToken, setResetToken] = useState(0);

  const { register, handleSubmit, control, setValue, watch, reset } = useForm<SaleFormValues>({
    defaultValues: {
      customerId: editSale?.customerId,
      paymentMethod: editSale?.paymentMethod ?? PaymentMethod.CASH,
      paymentStatus: PaymentStatus.UNPAID,
      amountPaid: 0,
    },
  });

  const customerId = watch('customerId');
  const paymentStatus = watch('paymentStatus');

  // Totals come from the committed lines only, never from the entry row's preview.
  const grandTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  const syncAmountToStatus = (v: PaymentStatus) => {
    if (v === PaymentStatus.PAID) setValue('amountPaid', Number(grandTotal.toFixed(2)));
    else if (v === PaymentStatus.UNPAID) setValue('amountPaid', 0);
  };
  const selectedCustomer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (isEdit) return;
    if (paymentStatus === PaymentStatus.PAID) setValue('amountPaid', Number(grandTotal.toFixed(2)));
    else if (paymentStatus === PaymentStatus.UNPAID) setValue('amountPaid', 0);
  }, [isEdit, paymentStatus, grandTotal, setValue]);

  // Opened with a branch that doesn't exist (e.g. typed URL): send the user back.
  const branchInvalid = !branchesLoading && !!branchId && !branches.some((b) => b.id === branchId);
  useEffect(() => {
    if (branchInvalid) router.replace('/sales');
  }, [branchInvalid, router]);

  const goToSales = () => router.push('/sales');

  const handleCustomerCreated = (customer: Customer) => {
    setValue('customerId', customer.id);
  };

  const handleCommit = (newLines: SaleLine[], replaceGroupId: string | null) => {
    setLines((prev) => {
      const at = replaceGroupId ? prev.findIndex((l) => l.groupId === replaceGroupId) : -1;
      if (at < 0) return [...prev, ...newLines];
      const rest = prev.filter((l) => l.groupId !== replaceGroupId);
      rest.splice(at, 0, ...newLines);
      return rest;
    });
    setEditing(null);
  };

  // A line split across batches is edited as one entry: combined qty, starting at its first batch.
  const handleEdit = (line: SaleLine) => {
    const at = lines.findIndex((l) => l.groupId === line.groupId);
    const group = lines.filter((l) => l.groupId === line.groupId);
    const first = group[0];
    setEditing({
      groupId: line.groupId,
      serial: at + 1,
      draft: {
        productId: first.productId,
        batchId: first.batchId,
        quantity: String(group.reduce((sum, l) => sum + l.quantity, 0)),
        unitPrice: String(first.unitPrice),
        discountPercent: first.discountPercent === undefined ? '' : String(first.discountPercent),
        taxPercent: first.taxPercent === undefined ? '' : String(first.taxPercent),
      },
    });
  };

  const handleRemove = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const onSubmit = async (values: SaleFormValues) => {
    if (!branchId || lines.length === 0 || isSaving) return;
    const items = lines.map((line) => ({
      productId: line.productId,
      manualAllocations: [{ batchId: line.batchId, quantity: line.quantity }],
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent,
    }));
    if (editSale) {
      try {
        await update(editSale.id, { customerId: values.customerId || undefined, items });
        goToSales();
      } catch (err) {
        // A 409 means a payment/return landed meanwhile; the hook already refreshed the invoice, so
        // leave this screen for the list where it now shows as locked.
        if (err instanceof ApiError && err.status === 409) goToSales();
      }
      return;
    }
    try {
      await create({
        branchId,
        orderBookerId: canPickBooker ? orderBookerId : undefined,
        customerId: values.customerId || undefined,
        paymentMethod: values.paymentMethod,
        paymentStatus: values.paymentStatus,
        amountPaid: Number(values.amountPaid),
        items,
      });
    } catch {
      // The mutation already toasted the error and createError shows below; keep the form as entered.
      return;
    }
    // Stay on the page for the next sale, on the same branch.
    reset({ paymentMethod: PaymentMethod.CASH, paymentStatus: PaymentStatus.UNPAID, amountPaid: 0, customerId: undefined });
    setLines([]);
    setEditing(null);
    setResetToken((t) => t + 1);
  };

  // Customers and products belong to a branch, so changing it clears the customer and the lines.
  const handleBranchChange = (nextBranchId: string) => {
    if (nextBranchId === branchId) return;
    setPickedBranch(nextBranchId);
    // Who may sell differs per branch, so the Order Booker goes back to the signed-in user.
    setPickedBooker('');
    setValue('customerId', undefined);
    setLines([]);
    setEditing(null);
  };

  const renderCustomerAndMethod = (inHeader: boolean) => {
    const labelClass = inHeader
      ? 'text-[10px] font-medium uppercase tracking-wide text-muted-foreground'
      : 'text-xs text-muted-foreground';
    return (
      <>
        <div className={inHeader ? 'space-y-0.5' : 'min-w-[16rem] flex-1 space-y-1'}>
          <Label className={labelClass}>Customer</Label>
          <Controller
            control={control}
            name="customerId"
            render={({ field: { value, onChange } }) => (
              <ComboboxWithCreate
                value={value}
                onChange={onChange}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                placeholder={branchId ? 'Walk-in (no customer)' : 'Select a branch first'}
                disabled={!branchId}
                onCreateNew={() => setCustomerDialogOpen(true)}
                createLabel={() => 'Create new customer'}
                className={inHeader ? 'h-9 text-sm' : undefined}
              />
            )}
          />
        </div>
        <div className={inHeader ? 'w-36 space-y-0.5' : 'w-full space-y-1 sm:w-56'}>
          <Label className={labelClass}>Payment method</Label>
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field: { value, onChange } }) => (
              <Select
                value={value}
                onValueChange={(v) => {
                  onChange(v);
                  if (!isEdit) syncAmountToStatus(v as PaymentStatus);
                }}
              >
                <SelectTrigger className={inHeader ? 'h-9 text-sm' : undefined}>
                  <SelectValue />
                </SelectTrigger>
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
        <div className={inHeader ? 'w-44 space-y-0.5' : 'w-full space-y-1 sm:w-52'}>
          <Label htmlFor={`saleBranch-${inHeader ? 'header' : 'body'}`} className={labelClass}>
            Branch *
          </Label>
          {isEdit || branchField.locked ? (
            <Input
              id={`saleBranch-${inHeader ? 'header' : 'body'}`}
              value={branchName ?? ''}
              disabled
              readOnly
              className={inHeader ? 'h-9 text-sm' : undefined}
            />
          ) : (
            <Select value={branchId ?? ''} onValueChange={handleBranchChange}>
              <SelectTrigger
                id={`saleBranch-${inHeader ? 'header' : 'body'}`}
                aria-label="Branch"
                className={inHeader ? 'h-9 text-sm' : undefined}
              >
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.isMain ? `${b.name} (Main)` : b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className={inHeader ? 'w-44 space-y-0.5' : 'w-full space-y-1 sm:w-52'}>
          <Label htmlFor={`saleOrderBooker-${inHeader ? 'header' : 'body'}`} className={labelClass}>
            Order Booker
          </Label>
          {isEdit || !canPickBooker ? (
            <Input
              id={`saleOrderBooker-${inHeader ? 'header' : 'body'}`}
              value={orderBookerName}
              disabled
              readOnly
              className={inHeader ? 'h-9 text-sm' : undefined}
            />
          ) : (
            <Select value={orderBookerId} onValueChange={setPickedBooker}>
              <SelectTrigger
                id={`saleOrderBooker-${inHeader ? 'header' : 'body'}`}
                aria-label="Order Booker"
                className={inHeader ? 'h-9 text-sm' : undefined}
              >
                <SelectValue placeholder={orderBookerName || 'Select Order Booker'} />
              </SelectTrigger>
              <SelectContent>
                {orderBookers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </>
    );
  };

  return (
    <PageAccessGuard requires={isEdit ? 'sales:update' : 'sales:create'}>
      <TopbarContent>
        <button
          type="button"
          onClick={goToSales}
          title="Back to Sales"
          aria-label="Back to Sales"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight">
            {isEdit ? `Edit Invoice ${editSale.invoiceNumber}` : 'New Sale'}
          </h1>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {isEdit ? 'Payments and returns are blocked once money is recorded' : branchName ? `Selling from ${branchName}` : 'Selling'}
          </p>
        </div>
        <div className="ml-4 hidden items-end gap-3 lg:flex">{renderCustomerAndMethod(true)}</div>
      </TopbarContent>

      {saveError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{saveError instanceof ApiError ? saveError.message : isEdit ? 'Failed to update sale' : 'Failed to create sale'}</span>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Below lg the top bar has no room for these, so they sit above the line items instead. */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3 lg:hidden">
          {renderCustomerAndMethod(false)}
        </div>

        <div className="space-y-3">
          <Label>Line items</Label>

          <div className="overflow-hidden rounded-lg border">
            <SaleEntryRow
              key={`${editing?.groupId ?? 'new'}-${resetToken}`}
              products={products}
              branchId={branchId}
              customerId={customerId}
              lines={lines}
              editing={editing}
              onCommit={handleCommit}
              onCancelEdit={() => setEditing(null)}
              restoreByBatch={restoreByBatch}
            />
            <SaleLinesList
              lines={lines}
              editingGroupId={editing?.groupId ?? null}
              onEdit={handleEdit}
              onRemove={handleRemove}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Each line defaults to the nearest-expiry batch; a quantity beyond that batch&apos;s stock splits into the next batches.
            Press Enter in Tax % to add the line, Esc to clear the entry row.
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border p-4">
          {isEdit ? (
            <p className="text-sm text-muted-foreground">Unpaid invoice: payment is recorded separately after saving.</p>
          ) : (
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
          )}
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Grand total</p>
            <p className="text-2xl font-semibold tabular-nums">{grandTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={goToSales}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !branchId || lines.length === 0}
          >
            {isSaving ? (isEdit ? 'Saving...' : 'Selling...') : isEdit ? 'Save Changes' : 'Complete Sale'}
          </Button>
        </div>
      </form>

      <CustomerDialog
        open={customerDialogOpen}
        mode="create"
        onOpenChange={setCustomerDialogOpen}
        onCreated={handleCustomerCreated}
      />
    </PageAccessGuard>
  );
}
