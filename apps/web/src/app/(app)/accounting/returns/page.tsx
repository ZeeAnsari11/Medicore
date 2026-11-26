'use client';

import { Suspense, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { DateRangeFilter, StatCards, inDateRange } from '@/components/layout/stat-cards';
import { ReportButton } from '@/components/layout/report-button';
import { useShownRows } from '@/hooks/use-shown-rows';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  ComboboxWithCreate,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { BranchFilter } from '@/components/branch-filter';
import { useSales } from '@/hooks/use-sales';
import { usePurchases } from '@/hooks/use-purchases';
import { useReturnableSaleItems, useReturnablePurchaseItems, useSaleReturns, usePurchaseReturns, useReturnsList } from '@/hooks/use-returns';
import { ApiError } from '@/lib/api-client';
import { SaleReturnsTable } from './components/sale-returns-table';
import { OpenFromUrl } from '@/components/open-from-url';
import { PurchaseReturnsTable } from './components/purchase-returns-table';
import type { CreateSaleReturnItemRequest, CreatePurchaseReturnItemRequest, SaleReturn, PurchaseReturn } from '@medicore/shared-types';


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Mode = 'sale' | 'purchase';

export default function ReturnsPage() {
  const { has } = usePermissions();

  const [mode, setMode] = useState<Mode>('sale');
  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [invoiceId, setInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(todayISO());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { returns: allHistory } = useReturnsList<SaleReturn | PurchaseReturn>(mode);
  const [range, setRange] = useState({ from: '', to: '' });
  const history = useMemo(() => allHistory.filter((r) => inDateRange(r.returnDate, range.from, range.to)), [allHistory, range]);
  const shown = useShownRows(history);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setInvoiceId('');
    setQuantities({});
  };

  const handleBranchChange = (next: string | null) => {
    branchFilter.setBranchId(next);
    setInvoiceId('');
    setQuantities({});
  };

  const handleInvoiceChange = (next: string) => {
    setInvoiceId(next);
    setQuantities({});
  };

  const { sales } = useSales(selectedBranchId);
  const { purchases } = usePurchases(selectedBranchId);
  const { items: saleItems } = useReturnableSaleItems(mode === 'sale' ? invoiceId || null : null);
  const { items: purchaseItems } = useReturnablePurchaseItems(mode === 'purchase' ? invoiceId || null : null);
  const { create: createSaleReturn, isCreating: isCreatingSaleReturn, createError: saleReturnError } = useSaleReturns();
  const { create: createPurchaseReturn, isCreating: isCreatingPurchaseReturn, createError: purchaseReturnError } = usePurchaseReturns();

  const isCreating = mode === 'sale' ? isCreatingSaleReturn : isCreatingPurchaseReturn;
  const createError = mode === 'sale' ? saleReturnError : purchaseReturnError;

  const setQty = (key: string, value: number, max: number) => {
    setQuantities((prev) => ({ ...prev, [key]: Math.max(0, Math.min(value, max)) }));
  };

  const returnTotals = useMemo(() => {
    const rows = shown.rows as { total?: number; kind?: string }[];
    const cancelled = rows.filter((r) => r.kind === 'CANCELLATION');
    const returned = rows.filter((r) => r.kind !== 'CANCELLATION');
    const sum = (a: { total?: number }[]) => a.reduce((n, r) => n + (r.total ?? 0), 0);
    return { count: returned.length, returned: sum(returned), cancelled: sum(cancelled) };
  }, [shown.rows]);
  const hasAnyQty = useMemo(() => Object.values(quantities).some((v) => v > 0), [quantities]);

  const handleSubmit = async () => {
    if (mode === 'sale') {
      const items: CreateSaleReturnItemRequest[] = saleItems
        .map((item) => ({
          productId: item.productId,
          batchAllocations: item.batchAllocations
            .filter((b) => (quantities[`${item.productId}:${b.batchId}`] ?? 0) > 0)
            .map((b) => ({ batchId: b.batchId, quantity: quantities[`${item.productId}:${b.batchId}`] })),
        }))
        .filter((item) => item.batchAllocations.length > 0);
      if (items.length === 0) return;
      await createSaleReturn({ saleId: invoiceId, items, reason: reason || undefined, returnDate });
    } else {
      const items: CreatePurchaseReturnItemRequest[] = purchaseItems
        .filter((item) => (quantities[`${item.productId}:${item.batchId}`] ?? 0) > 0)
        .map((item) => ({
          productId: item.productId,
          batchId: item.batchId,
          quantity: quantities[`${item.productId}:${item.batchId}`],
        }));
      if (items.length === 0) return;
      await createPurchaseReturn({ purchaseId: invoiceId, items, reason: reason || undefined, returnDate });
    }
    setInvoiceId('');
    setQuantities({});
    setReason('');
  };

  return (
    <PageAccessGuard requires="acc_returns:read">
      {/* A ledger link to a purchase return arrives as ?mode=purchase&open=<id>. */}
      <Suspense fallback={null}>
        <OpenFromUrl param="mode" onOpen={(m) => m === 'purchase' && setMode('purchase')} />
      </Suspense>

      <PageHeader
        report={<ReportButton
          title={mode === 'sale' ? 'Sale Returns' : 'Purchase Returns'}
          summary={[
            [mode === 'sale' ? 'Sale returns' : 'Purchase returns', returnTotals.count],
            ['Total returned', returnTotals.returned.toFixed(2)],
            ['Cancelled by void', returnTotals.cancelled.toFixed(2)],
          ]}
          subtitle={range.from || range.to ? `${range.from || 'start'} to ${range.to || 'today'}` : 'All dates'}
          totalColumns={['Total']}
          rows={(shown.rows as Array<SaleReturn & PurchaseReturn>).map((r) => ({
            'Return #': r.returnNumber ?? '',
            Date: new Date(r.returnDate).toLocaleDateString('en-CA'),
            Invoice: (mode === 'sale' ? r.invoiceNumber : r.purchaseNumber) ?? '',
            [mode === 'sale' ? 'Customer' : 'Vendor']: (mode === 'sale' ? r.customerName : r.vendorName) ?? '',
            Total: (r.total ?? 0).toFixed(2),
            Type: r.kind === 'CANCELLATION' ? 'Cancelled by void' : 'Return',
            Reason: r.reason ?? '',
          }))}
        />}
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        title="Returns"
        description="Return sold or purchased stock, with cumulative quantity tracking so the same stock can never be returned twice."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border">
          <button
            className={`px-4 py-2 text-sm ${mode === 'sale' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
            onClick={() => handleModeChange('sale')}
          >
            Sale Return
          </button>
          <button
            className={`px-4 py-2 text-sm ${mode === 'purchase' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
            onClick={() => handleModeChange('purchase')}
          >
            Purchase Return
          </button>
        </div>

        <BranchFilter filter={{ ...branchFilter, setBranchId: handleBranchChange }} />

        <ComboboxWithCreate
          className="w-full sm:w-72"
          options={(mode === 'sale' ? sales : purchases).map((doc) => {
            const number = mode === 'sale' ? (doc as { invoiceNumber: string }).invoiceNumber : (doc as { purchaseNumber: string }).purchaseNumber;
            return { value: doc.id, label: number };
          })}
          value={invoiceId}
          onChange={handleInvoiceChange}
          placeholder={mode === 'sale' ? 'Select an invoice' : 'Select a purchase'}
          searchPlaceholder={mode === 'sale' ? 'Search by invoice number...' : 'Search by purchase number...'}
          emptyMessage={mode === 'sale' ? 'No invoice with that number.' : 'No purchase with that number.'}
        />
      </div>

      {createError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{createError instanceof ApiError ? createError.message : 'Failed to record return'}</span>
        </Alert>
      )}

      {invoiceId && (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-4">
            {/* One row per batch: what was sold, what is already back, what can still return, and the qty to return now. */}
            {(() => {
              const rows =
                mode === 'sale'
                  ? saleItems.flatMap((item) =>
                      item.batchAllocations.map((b) => ({
                        key: `${item.productId}:${b.batchId}`,
                        product: item.productName,
                        batch: b.batchNumber,
                        original: b.originalQuantity,
                        returned: b.alreadyReturned,
                        returnable: b.returnable,
                      })),
                    )
                  : purchaseItems.map((item) => ({
                      key: `${item.productId}:${item.batchId}`,
                      product: item.productName,
                      batch: item.batchNumber,
                      original: item.originalQuantity,
                      returned: item.alreadyReturned,
                      returnable: item.returnable,
                    }));
              if (rows.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    Nothing returnable on this {mode === 'sale' ? 'invoice' : 'purchase'}.
                  </p>
                );
              }
              return (
                <div className="rounded-lg border">
                  <Table className="[&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1 [&_td]:leading-tight">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Batch #</TableHead>
                        <TableHead className="text-right">{mode === 'sale' ? 'Sold' : 'Received'}</TableHead>
                        <TableHead className="text-right">Returned</TableHead>
                        <TableHead className="text-right">Returnable</TableHead>
                        <TableHead className="w-28 text-right">Return qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell className="font-medium">{r.product}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{r.batch}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.original}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.returned || '—'}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{r.returnable}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              integer
                              min="0"
                              max={r.returnable}
                              className="ml-auto h-7 w-20 text-right"
                              disabled={r.returnable <= 0}
                              value={quantities[r.key] ?? ''}
                              onChange={(e) => setQty(r.key, Number(e.target.value), r.returnable)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Return Date</Label>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Input placeholder="Optional" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={!hasAnyQty || !has('acc_returns:create') || isCreating} onClick={handleSubmit}>
                {isCreating ? 'Saving...' : 'Record Return'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 space-y-2">
        <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />
        <StatCards
          items={[
            { title: mode === 'sale' ? 'Sale returns' : 'Purchase returns', value: returnTotals.count, count: true },
            { title: 'Total returned', value: returnTotals.returned },
            { title: 'Cancelled by void', value: returnTotals.cancelled, hint: 'Reversed with Void invoice' },
          ]}
        />
        <h2 className="text-sm font-medium">Recorded {mode === 'sale' ? 'sale' : 'purchase'} returns</h2>
        {mode === 'sale' ? (
          <SaleReturnsTable returns={history as SaleReturn[]} onFilteredRowsChange={shown.onFilteredRowsChange as (rows: SaleReturn[]) => void} />
        ) : (
          <PurchaseReturnsTable returns={history as PurchaseReturn[]} onFilteredRowsChange={shown.onFilteredRowsChange as (rows: PurchaseReturn[]) => void} />
        )}
      </div>
    </PageAccessGuard>
  );
}
