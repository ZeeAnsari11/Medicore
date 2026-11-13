'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { BranchFilter } from '@/components/branch-filter';
import { useSales } from '@/hooks/use-sales';
import { usePurchases } from '@/hooks/use-purchases';
import { useReturnableSaleItems, useReturnablePurchaseItems, useSaleReturns, usePurchaseReturns, useReturnsList } from '@/hooks/use-returns';
import { ApiError } from '@/lib/api-client';
import type { CreateSaleReturnItemRequest, CreatePurchaseReturnItemRequest, SaleReturn, PurchaseReturn } from '@medicore/shared-types';


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Mode = 'sale' | 'purchase';

export default function ReturnsPage() {
  const router = useRouter();
  const { has } = usePermissions();

  const [mode, setMode] = useState<Mode>('sale');
  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [invoiceId, setInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(todayISO());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { returns: history } = useReturnsList<SaleReturn | PurchaseReturn>(mode);

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
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Returns"
        description="Return sold or purchased stock, with cumulative quantity tracking so the same stock can never be returned twice."
      />

      <div className="mb-6 flex items-center gap-3">
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

        <Select value={invoiceId} onValueChange={handleInvoiceChange}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={mode === 'sale' ? 'Select an invoice' : 'Select a purchase'} />
          </SelectTrigger>
          <SelectContent>
            {(mode === 'sale' ? sales : purchases).map((doc) => (
              <SelectItem key={doc.id} value={doc.id}>
                {mode === 'sale' ? (doc as { invoiceNumber: string }).invoiceNumber : (doc as { purchaseNumber: string }).purchaseNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {createError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{createError instanceof ApiError ? createError.message : 'Failed to record return'}</span>
        </Alert>
      )}

      {!invoiceId ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Select {mode === 'sale' ? 'an invoice' : 'a purchase'} to view returnable items.
        </p>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {mode === 'sale' ? (
              saleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing returnable on this invoice.</p>
              ) : (
                <div className="space-y-4">
                  {saleItems.map((item) => (
                    <div key={item.productId} className="space-y-2">
                      <h4 className="text-sm font-medium">{item.productName}</h4>
                      {item.batchAllocations.map((b) => {
                        const key = `${item.productId}:${b.batchId}`;
                        return (
                          <div key={key} className="flex items-center gap-3 pl-3 text-sm">
                            <span className="w-32 text-muted-foreground">Batch {b.batchNumber}</span>
                            <span className="w-40 text-muted-foreground">
                              Sold {b.originalQuantity} · Returned {b.alreadyReturned} · Returnable {b.returnable}
                            </span>
                            <Input
                              type="number"
                              min="0"
                              max={b.returnable}
                              className="w-24"
                              disabled={b.returnable <= 0}
                              value={quantities[key] ?? ''}
                              onChange={(e) => setQty(key, Number(e.target.value), b.returnable)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )
            ) : purchaseItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing returnable on this purchase.</p>
            ) : (
              <div className="space-y-2">
                {purchaseItems.map((item) => {
                  const key = `${item.productId}:${item.batchId}`;
                  return (
                    <div key={key} className="flex items-center gap-3 text-sm">
                      <span className="w-48 font-medium">{item.productName}</span>
                      <span className="w-32 text-muted-foreground">Batch {item.batchNumber}</span>
                      <span className="w-40 text-muted-foreground">
                        Received {item.originalQuantity} · Returned {item.alreadyReturned} · Returnable {item.returnable}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max={item.returnable}
                        className="w-24"
                        disabled={item.returnable <= 0}
                        value={quantities[key] ?? ''}
                        onChange={(e) => setQty(key, Number(e.target.value), item.returnable)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4">
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
        <h2 className="text-sm font-medium">Recorded {mode === 'sale' ? 'sale' : 'purchase'} returns</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No returns recorded yet</TableCell>
                </TableRow>
              ) : (
                history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.returnNumber ?? '—'}</TableCell>
                    <TableCell className="text-sm">{new Date(r.returnDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reason ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{(r.total ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageAccessGuard>
  );
}
