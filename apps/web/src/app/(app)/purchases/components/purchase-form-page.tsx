'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import {
  Alert,
  Button,
  ComboboxWithCreate,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@medicore/ui';
import { TopbarContent } from '@/components/layout/topbar-slot';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { usePurchases } from '@/hooks/use-purchases';
import { useVendors } from '@/hooks/use-vendors';
import { useVendorProductsForVendor } from '@/hooks/use-vendor-products';
import { useProducts } from '@/hooks/use-products';
import { formatRs } from '@/components/last-price-hint';
import { useBranchField } from '@/hooks/use-branch-field';
import { useBranches } from '@/hooks/use-branches';
import { ApiError } from '@/lib/api-client';
import { PaymentStatus, type Purchase, type PurchasePriceUpdateRequest } from '@medicore/shared-types';
import { PriceChangeDialog, type PriceChangeRow } from './price-change-dialog';
import { PurchaseEntryRow, type PurchaseEditTarget } from './purchase-entry-row';
import { PurchaseLinesList } from './purchase-lines-list';
import { lineTotal, type PurchaseLine } from './purchase-line-utils';

interface PurchaseFormValues {
  vendorId: string;
  vendorInvoiceNumber?: string;
  purchaseDate: string;
  paymentStatus: PaymentStatus;
  amountPaid: number;
}

/** Lines of an existing purchase, one per item. */
function linesFromPurchase(purchase: Purchase): PurchaseLine[] {
  return purchase.items.map((item, index) => ({
    key: `existing-${index}`,
    productId: item.productId,
    productName: item.productName ?? '',
    batchNumber: item.batchNumber,
    expiryDate: item.expiryDate.slice(0, 10),
    quantity: item.quantity,
    purchasePrice: item.purchasePrice,
    sellingPrice: item.sellingPrice,
    discountPercent: item.discountPercent,
    taxPercent: item.taxPercent,
  }));
}

/** The New Purchase screen, or (with `editPurchase`) the same screen prefilled to edit an unpaid purchase. */
export function PurchaseFormPage({ editPurchase }: { editPurchase?: Purchase }) {
  const router = useRouter();

  const { branches, isLoading: branchesLoading } = useBranches();
  const branchField = useBranchField();
  // The purchase's branch is this form's own field (defaults to the main branch, locked for branch users), never the top bar.
  const [pickedBranch, setPickedBranch] = useState(editPurchase?.branchId ?? '');
  const mainBranchId = (branches.find((b) => b.isMain) ?? branches[0])?.id;
  const branchId = editPurchase?.branchId ?? (pickedBranch || branchField.defaultBranchId || mainBranchId || null);
  // Products are per branch: the picker lists the purchase's own branch, not the top-bar one.
  // Vendors and products are per branch: the pickers list this purchase's own branch, not the top-bar one.
  const { vendors } = useVendors(undefined, branchId);
  const { products } = useProducts({ branchId });
  const { create, isCreating, createError, update, isUpdating, updateError } = usePurchases(branchId);
  const isEdit = !!editPurchase;
  const isSaving = isCreating || isUpdating;
  const saveError = isEdit ? updateError : createError;

  const branchName = branches.find((b) => b.id === branchId)?.name;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingVendorId, setPendingVendorId] = useState<string | null>(null);
  const [pendingPrices, setPendingPrices] = useState<{ values: PurchaseFormValues; rows: PriceChangeRow[] } | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>(() => (editPurchase ? linesFromPurchase(editPurchase) : []));
  const [editing, setEditing] = useState<PurchaseEditTarget | null>(null);
  // Bumped after each received purchase to remount the entry row and clear it.
  const [resetToken, setResetToken] = useState(0);

  const freshFormValues = (): PurchaseFormValues => ({
    vendorId: editPurchase?.vendorId ?? '',
    vendorInvoiceNumber: editPurchase?.vendorInvoiceNumber ?? '',
    purchaseDate: (editPurchase?.purchaseDate ?? new Date().toISOString()).slice(0, 10),
    paymentStatus: PaymentStatus.UNPAID,
    amountPaid: 0,
  });

  const { register, handleSubmit, setValue, watch, reset } = useForm<PurchaseFormValues>({
    defaultValues: freshFormValues(),
  });

  const vendorId = watch('vendorId');
  const paymentStatus = watch('paymentStatus');

  // Only products linked (and active) for the selected vendor can be received.
  const { vendorProducts } = useVendorProductsForVendor(vendorId || null);
  const activeVendorProducts = vendorProducts.filter((vp) => vp.isActive);
  const vendorProductIds = new Set(activeVendorProducts.map((vp) => vp.productId));
  const vendorScopedProducts = products.filter((p) => vendorProductIds.has(p.id));

  // Totals come from the committed lines only, never from the entry row's preview.
  const grandTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);

  useEffect(() => {
    if (isEdit) return;
    if (paymentStatus === PaymentStatus.PAID) setValue('amountPaid', Number(grandTotal.toFixed(2)));
    else if (paymentStatus === PaymentStatus.UNPAID) setValue('amountPaid', 0);
  }, [isEdit, paymentStatus, grandTotal, setValue]);

  const handleVendorChange = (nextVendorId: string) => {
    if (nextVendorId === vendorId) return;
    if (lines.length > 0) {
      setPendingVendorId(nextVendorId);
      return;
    }
    setValue('vendorId', nextVendorId);
  };

  // Vendors and products belong to a branch, so changing it clears the vendor and the lines.
  const handleBranchChange = (nextBranchId: string) => {
    if (nextBranchId === branchId) return;
    setPickedBranch(nextBranchId);
    setValue('vendorId', '');
    setLines([]);
    setEditing(null);
  };

  const confirmVendorChange = () => {
    if (pendingVendorId) {
      setValue('vendorId', pendingVendorId);
      setLines([]);
      setEditing(null);
    }
    setPendingVendorId(null);
  };

  const handleCommit = (line: PurchaseLine, replaceKey: string | null) => {
    setLines((prev) =>
      replaceKey && prev.some((l) => l.key === replaceKey)
        ? prev.map((l) => (l.key === replaceKey ? line : l))
        : [...prev, line],
    );
    setEditing(null);
  };

  const handleEdit = (line: PurchaseLine) => {
    setEditing({
      key: line.key,
      serial: lines.findIndex((l) => l.key === line.key) + 1,
      draft: {
        productId: line.productId,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
        quantity: String(line.quantity),
        purchasePrice: String(line.purchasePrice),
        sellingPrice: String(line.sellingPrice),
        discountPercent: line.discountPercent === undefined ? '' : String(line.discountPercent),
        taxPercent: line.taxPercent === undefined ? '' : String(line.taxPercent),
      },
    });
  };

  const handleRemove = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
    if (editing?.key === key) setEditing(null);
  };

  /** Decreases vs the vendor's linked price; the server applies increases on its own. */
  const buildPriceRows = (): PriceChangeRow[] => {
    const highest = new Map<string, number>();
    for (const l of lines) {
      highest.set(l.productId, Math.max(highest.get(l.productId) ?? 0, Number(l.purchasePrice)));
    }
    const rows: PriceChangeRow[] = [];
    for (const [productId, newPrice] of highest) {
      const link = activeVendorProducts.find((vp) => vp.productId === productId);
      const product = products.find((p) => p.id === productId);
      if (!link || !product || newPrice >= link.purchasePrice) continue;
      rows.push({ productId, name: product.name, oldPrice: link.purchasePrice, newPrice });
    }
    return rows;
  };

  // Opened with a branch that doesn't exist (e.g. typed URL): send the user back.
  const branchInvalid = !branchesLoading && !!branchId && !branches.some((b) => b.id === branchId);
  useEffect(() => {
    if (branchInvalid) router.replace('/purchases');
  }, [branchInvalid, router]);

  const goToPurchases = () => router.push('/purchases');

  const onSubmit = async (values: PurchaseFormValues) => {
    if (!branchId || lines.length === 0 || isSaving) return;
    if (!values.vendorId) {
      setSubmitError('Select a vendor before receiving this purchase.');
      return;
    }
    setSubmitError(null);
    if (editPurchase) {
      try {
        await update(editPurchase.id, {
          vendorId: values.vendorId,
          vendorInvoiceNumber: values.vendorInvoiceNumber || undefined,
          purchaseDate: values.purchaseDate,
          items: lines.map((line) => ({
            productId: line.productId,
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate,
            quantity: line.quantity,
            purchasePrice: line.purchasePrice,
            sellingPrice: line.sellingPrice,
            discountPercent: line.discountPercent,
            taxPercent: line.taxPercent,
          })),
        });
        goToPurchases();
      } catch (err) {
        // A 409 means a payment landed or the stock was already sold; the hook already refreshed the
        // invoice. A locked one goes back to the list; a batch conflict keeps the form so it can be fixed.
        if (err instanceof ApiError && err.status === 409 && /locked/i.test(err.message)) goToPurchases();
      }
      return;
    }
    const rows = buildPriceRows();
    if (rows.length > 0) {
      setPendingPrices({ values, rows });
      return;
    }
    await submitPurchase(values);
  };

  const submitPurchase = async (values: PurchaseFormValues, priceUpdates?: PurchasePriceUpdateRequest[]) => {
    if (!branchId) return;
    let created;
    try {
      created = await create({
        branchId,
        vendorId: values.vendorId,
        vendorInvoiceNumber: values.vendorInvoiceNumber || undefined,
        purchaseDate: values.purchaseDate,
        paymentStatus: values.paymentStatus,
        amountPaid: Number(values.amountPaid),
        priceUpdates,
        items: lines.map((line) => ({
          productId: line.productId,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          quantity: line.quantity,
          purchasePrice: line.purchasePrice,
          sellingPrice: line.sellingPrice,
          discountPercent: line.discountPercent,
          taxPercent: line.taxPercent,
        })),
      });
    } catch {
      // The mutation already toasted the error and createError shows below; keep the form as entered.
      return;
    }
    if (created.priceChanges.length > 0) {
      toast.success(
        created.priceChanges
          .map(
            (c) =>
              `${c.productName}: vendor price ${formatRs(c.oldPurchasePrice)} → ${formatRs(c.newPurchasePrice)}`,
          )
          .join('\n'),
      );
    }
    // Stay on the page for the next purchase, at the same branch.
    reset(freshFormValues());
    setLines([]);
    setEditing(null);
    setPendingVendorId(null);
    setResetToken((t) => t + 1);
    // Product is disabled until a vendor is picked, so the vendor field is next.
    requestAnimationFrame(() => {
      // The vendor field renders in the header (xl+) and in the body card below; focus whichever is visible.
      const visible = ['purchase-vendor-header', 'purchase-vendor-body']
        .map((id) => document.getElementById(id))
        .find((el) => el && el.offsetParent !== null);
      visible?.focus();
    });
  };

  const renderPurchaseFields = (inHeader: boolean) => {
    const suffix = inHeader ? 'header' : 'body';
    const labelClass = inHeader
      ? 'text-[10px] font-medium uppercase tracking-wide text-muted-foreground'
      : 'text-xs text-muted-foreground';
    const controlClass = inHeader ? 'h-9 text-sm' : undefined;
    return (
      <>
        <div className={inHeader ? 'space-y-0.5' : 'min-w-[16rem] flex-1 space-y-1'}>
          <Label className={labelClass}>Vendor *</Label>
          <ComboboxWithCreate
            id={`purchase-vendor-${suffix}`}
            value={vendorId}
            onChange={handleVendorChange}
            options={vendors.map((v) => ({ value: v.id, label: v.company }))}
            placeholder={branchId ? 'Select vendor' : 'Select a branch first'}
            searchPlaceholder="Search vendors..."
            disabled={!branchId}
            className={controlClass}
          />
        </div>

        <div className={inHeader ? 'w-36 space-y-0.5' : 'w-full space-y-1 sm:w-52'}>
          <Label htmlFor={`vendorInvoiceNumber-${suffix}`} className={labelClass}>
            Vendor invoice #
          </Label>
          <Input
            id={`vendorInvoiceNumber-${suffix}`}
            placeholder="Optional"
            className={controlClass}
            {...register('vendorInvoiceNumber')}
          />
        </div>

        <div className={inHeader ? 'w-36 space-y-0.5' : 'w-full space-y-1 sm:w-44'}>
          <Label htmlFor={`purchaseDate-${suffix}`} className={labelClass}>
            Purchase date
          </Label>
          <Input
            id={`purchaseDate-${suffix}`}
            type="date"
            className={controlClass}
            {...register('purchaseDate', { required: true })}
          />
        </div>

        <div className={inHeader ? 'w-44 space-y-0.5' : 'w-full space-y-1 sm:w-52'}>
          <Label htmlFor={`purchaseBranch-${suffix}`} className={labelClass}>
            Branch *
          </Label>
          {isEdit || branchField.locked ? (
            <Input id={`purchaseBranch-${suffix}`} value={branchName ?? ''} disabled readOnly className={controlClass} />
          ) : (
            <Select value={branchId ?? ''} onValueChange={handleBranchChange}>
              <SelectTrigger id={`purchaseBranch-${suffix}`} aria-label="Branch" className={controlClass}>
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
      </>
    );
  };

  return (
    <PageAccessGuard requires={isEdit ? 'purchases:update' : 'purchases:create'}>
      <TopbarContent>
        <button
          type="button"
          onClick={goToPurchases}
          title="Back to Purchases"
          aria-label="Back to Purchases"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight tracking-tight">
            {isEdit ? `Edit Purchase ${editPurchase.purchaseNumber}` : 'New Purchase'}
          </h1>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {isEdit ? 'Stock is adjusted; sold batches cannot be reduced' : branchName ? `Receiving stock at ${branchName}` : 'Receiving stock'}
          </p>
        </div>
        <div className="ml-4 hidden items-end gap-3 xl:flex">{renderPurchaseFields(true)}</div>
      </TopbarContent>

      {saveError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{saveError instanceof ApiError ? saveError.message : isEdit ? 'Failed to update purchase' : 'Failed to create purchase'}</span>
        </Alert>
      )}

      {submitError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{submitError}</span>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Below xl the top bar has no room for these, so they sit above the line items instead. */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3 xl:hidden">
          {renderPurchaseFields(false)}
        </div>

        <div className="space-y-3">
          <Label>Line items</Label>

          <div className="overflow-hidden rounded-lg border">
            <PurchaseEntryRow
              key={`${editing?.key ?? 'new'}-${resetToken}`}
              products={vendorScopedProducts}
              vendorProducts={activeVendorProducts}
              vendorId={vendorId}
              branchId={branchId}
              serial={lines.length + 1}
              editing={editing}
              onCommit={handleCommit}
              onCancelEdit={() => setEditing(null)}
            />
            <PurchaseLinesList
              lines={lines}
              editingKey={editing?.key ?? null}
              onEdit={handleEdit}
              onRemove={handleRemove}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Press Enter in Tax % to add the line, Esc to clear the entry row.
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border p-4">
          {isEdit ? (
            <p className="text-sm text-muted-foreground">Unpaid purchase: payment is recorded separately after saving.</p>
          ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment status</Label>
              <Select
                value={paymentStatus}
                onValueChange={(v) => setValue('paymentStatus', v as PaymentStatus)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PaymentStatus.UNPAID}>Unpaid</SelectItem>
                  <SelectItem value={PaymentStatus.PARTIAL}>Partial</SelectItem>
                  <SelectItem value={PaymentStatus.PAID}>Paid</SelectItem>
                </SelectContent>
              </Select>
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
          <Button type="button" variant="outline" onClick={goToPurchases}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving || !branchId || lines.length === 0}>
            {isSaving ? (isEdit ? 'Saving...' : 'Receiving...') : isEdit ? 'Save Changes' : 'Receive Purchase'}
          </Button>
        </div>
      </form>

      {pendingPrices && (
        <PriceChangeDialog
          rows={pendingPrices.rows}
          isSaving={isCreating}
          onCancel={() => setPendingPrices(null)}
          onConfirm={async (updates) => {
            const { values } = pendingPrices;
            try {
              await submitPurchase(values, updates);
            } finally {
              setPendingPrices(null);
            }
          }}
        />
      )}

      <Dialog open={pendingVendorId !== null} onOpenChange={(open) => !open && setPendingVendorId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change vendor?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Changing the vendor will clear all line items you have added.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingVendorId(null)}>
              Keep current vendor
            </Button>
            <Button type="button" onClick={confirmVendorChange}>
              Change vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </PageAccessGuard>
  );
}
