'use client';

import { Suspense, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { BranchFilter } from '@/components/branch-filter';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useUrlState } from '@/hooks/use-url-state';
import {
  usePendingOrderSummary,
  usePendingOrders,
  usePendingOrdersPreview,
  useProcessOrders,
  useSale,
} from '@/hooks/use-sales';

/** Calendar day in Pakistan time (UTC+5, no DST), matching the SSR page. */
const karachiToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });

export default function ProcessOrdersPage() {
  return (
    <PageAccessGuard requires="process_orders:read">
      <Suspense fallback={null}>
        <Content />
      </Suspense>
    </PageAccessGuard>
  );
}

function Content() {
  const url = useUrlState();
  const branchFilter = useBranchFilter(url.get('branch'));
  const date = url.get('date') || karachiToday();
  const bookerId = url.get('booker');
  const { bookers, isLoading, error } = usePendingOrderSummary(date, branchFilter.branchId);
  const booker = bookers.find((b) => b.orderBookerId === bookerId);

  return (
    <div>
      <PageHeader title="Process Orders" description="Confirm or reject the orders placed by each Order Booker." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="date"
          aria-label="Order date"
          className="w-44"
          value={date}
          max={karachiToday()}
          onChange={(e) => url.set({ date: e.target.value || null, booker: null })}
        />
        <BranchFilter filter={branchFilter} />
      </div>

      {error ? (
        <Alert variant="destructive">Could not load pending orders.</Alert>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : booker ? (
        <BookerOrders
          date={date}
          booker={booker}
          branchId={branchFilter.branchId}
          onBack={() => url.set({ booker: null })}
        />
      ) : bookerId ? (
        // The booker's last order was just processed, so there is nothing left to show.
        <BackToList onBack={() => url.set({ booker: null })} />
      ) : bookers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending orders for this date.</p>
      ) : (
        <div className="max-w-xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order Booker</TableHead>
                <TableHead className="text-right">Order Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookers.map((b) => (
                <TableRow
                  key={b.orderBookerId}
                  className="cursor-pointer"
                  onClick={() => url.set({ booker: b.orderBookerId })}
                >
                  <TableCell className="font-medium">{b.orderBookerName}</TableCell>
                  <TableCell className="text-right">{b.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function BackToList({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">No pending orders left for this Order Booker.</p>
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Order Bookers
      </Button>
    </div>
  );
}

function BookerOrders({
  date,
  booker,
  branchId,
  onBack,
}: {
  date: string;
  booker: { orderBookerId: string; orderBookerName: string };
  branchId: string | null;
  onBack: () => void;
}) {
  const { orders, isLoading } = usePendingOrders(date, booker.orderBookerId, branchId);
  const { confirmOrders, rejectOrders, isProcessing } = useProcessOrders(branchId);
  const [picked, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<'confirm' | 'reject' | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Only orders still in the list count as selected (others were processed, or the day changed).
  const selected = useMemo(() => {
    const ids = new Set(orders.map((o) => o.id));
    return new Set([...picked].filter((id) => ids.has(id)));
  }, [picked, orders]);

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const headerState = allSelected ? true : selected.size > 0 ? 'indeterminate' : false;
  const toggle = (id: string) =>
    setSelected(() => {
      const next = new Set(selected);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));

  const run = async () => {
    if (!action) return;
    const ids = [...selected];
    try {
      await (action === 'confirm' ? confirmOrders(ids) : rejectOrders(ids));
      setSelected(new Set());
    } catch {
      // The mutation already toasted the error; the selection stays so the admin can retry.
    } finally {
      setAction(null);
    }
  };

  const day = date === karachiToday() ? "Today's" : `${date}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Order Bookers
        </Button>
        <h2 className="text-base font-semibold">
          {booker.orderBookerName} — {day} Orders
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {selected.size} {selected.size === 1 ? 'order' : 'orders'} selected
        </span>
        <Button size="sm" disabled={selected.size === 0 || isProcessing} onClick={() => setAction('confirm')}>
          Confirm Selected
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={selected.size === 0 || isProcessing}
          onClick={() => setAction('reject')}
        >
          Reject Selected
        </Button>
        <Button size="sm" variant="outline" disabled={orders.length === 0} onClick={() => setPreviewOpen(true)}>
          Preview
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={headerState}
                  disabled={orders.length === 0}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Order Number</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${o.orderNumber}`}
                      checked={selected.has(o.id)}
                      onCheckedChange={() => toggle(o.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => setViewingId(o.id)}
                    >
                      {o.orderNumber}
                    </button>
                  </TableCell>
                  <TableCell>{timeOf(o.placedAt)}</TableCell>
                  <TableCell>{o.customerName ?? 'Walk-in customer'}</TableCell>
                  <TableCell>
                    {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'}
                  </TableCell>
                  <TableCell className="text-right">{money(o.grandTotal)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && !isProcessing && setAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{action === 'confirm' ? 'Confirm orders' : 'Reject orders'}</DialogTitle>
            <DialogDescription>
              {action === 'confirm'
                ? `Confirm ${selected.size} ${selected.size === 1 ? 'order' : 'orders'}? Each gets an invoice number and appears on the Sales page.`
                : `Reject ${selected.size} ${selected.size === 1 ? 'order' : 'orders'}? The stock goes back to its batches and the orders are removed. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant={action === 'reject' ? 'destructive' : 'default'} onClick={run} disabled={isProcessing}>
              {isProcessing ? 'Processing...' : action === 'confirm' ? 'Yes, confirm' : 'Yes, reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrderDetailDialog id={viewingId} branchId={branchId} onClose={() => setViewingId(null)} />
      <OrdersPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`${booker.orderBookerName} — ${day} Orders`}
        date={date}
        orderBookerId={booker.orderBookerId}
        branchId={branchId}
      />
    </div>
  );
}

/** Every pending order of the booker with its lines, as one scrollable report. */
function OrdersPreviewDialog({
  open,
  onClose,
  title,
  date,
  orderBookerId,
  branchId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  date: string;
  orderBookerId: string;
  branchId: string | null;
}) {
  const { sales, isLoading } = usePendingOrdersPreview(date, orderBookerId, branchId, open);
  const itemCount = sales.reduce((sum, s) => sum + s.items.length, 0);
  const grandTotal = sales.reduce((sum, s) => sum + s.grandTotal, 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? 'Loading...'
              : `${sales.length} ${sales.length === 1 ? 'order' : 'orders'} · ${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${money(grandTotal)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {sales.map((sale) => (
            <section key={sale.id} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1">
                <h3 className="text-sm font-semibold">{sale.orderNumber}</h3>
                <p className="text-xs text-muted-foreground">
                  {timeOf(sale.createdAt as unknown as string)} · {sale.customerName ?? 'Walk-in customer'}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Disc %</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items.map((item, i) => (
                    <TableRow key={`${item.productId}-${i}`}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.batchAllocations.map((a) => a.batchNumber).join(', ')}
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{money(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{item.discountPercent ?? 0}</TableCell>
                      <TableCell className="text-right">{money(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-right text-sm">
                <span className="text-muted-foreground">Paid {money(sale.amountPaid)} · </span>
                <span className="font-semibold">Order total {money(sale.grandTotal)}</span>
              </p>
            </section>
          ))}
        </div>

        {sales.length > 0 && (
          <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm font-semibold">
            <span>
              {sales.length} {sales.length === 1 ? 'order' : 'orders'} · {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
            <span>Grand total {money(grandTotal)}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Read-only view of one pending order and its lines. */
function OrderDetailDialog({
  id,
  branchId,
  onClose,
}: {
  id: string | null;
  branchId: string | null;
  onClose: () => void;
}) {
  const { sale } = useSale(id, branchId);
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{sale?.orderNumber ?? 'Order'}</DialogTitle>
          <DialogDescription>
            {sale
              ? `${sale.orderBookerName} · ${sale.customerName ?? 'Walk-in customer'} · ${timeOf(sale.createdAt as unknown as string)}`
              : 'Loading...'}
          </DialogDescription>
        </DialogHeader>
        {sale && (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Disc %</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.items.map((item, i) => (
                  <TableRow key={`${item.productId}-${i}`}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.batchAllocations.map((a) => a.batchNumber).join(', ')}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{money(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{item.discountPercent ?? 0}</TableCell>
                    <TableCell className="text-right">{money(item.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="ml-auto w-56 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{money(sale.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd>{money(sale.discountTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd>{money(sale.taxTotal)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{money(sale.grandTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd>{money(sale.amountPaid)}</dd>
              </div>
            </dl>
            {sale.notes && <p className="text-sm text-muted-foreground">{sale.notes}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
