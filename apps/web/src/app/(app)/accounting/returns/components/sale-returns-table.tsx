'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type ColumnDef,
} from '@medicore/ui';
import { OpenFromUrl } from '@/components/open-from-url';
import { ReturnSettlementMode } from '@medicore/shared-types';
import type { SaleReturn } from '@medicore/shared-types';

const money = (n: number) => n.toFixed(2);

/** How the return was settled: taken off the invoice, refunded (with the method) and/or left as customer credit. */
export function settlementLabel(r: Pick<SaleReturn, 'settlement'>): string {
  const s = r.settlement;
  if (!s) return '—';
  const parts: string[] = [];
  if (s.appliedToOutstanding > 0.005) parts.push(`${money(s.appliedToOutstanding)} off invoice`);
  if (s.refundAmount > 0.005) parts.push(`${money(s.refundAmount)} refunded${s.method ? ` (${s.method})` : ''}`);
  if (s.creditAmount > 0.005) parts.push(`${money(s.creditAmount)} credit`);
  return parts.length ? parts.join(', ') : s.mode === ReturnSettlementMode.REFUND ? 'Refund' : 'Adjusted';
}

const invoiceLink = (r: SaleReturn) =>
  r.invoiceNumber ? (
    <Link href={`/sales?open=${r.saleId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
      {r.invoiceNumber}
    </Link>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

/** Recorded sale returns, laid out like the Payments list: id, date, party, amount, settlement, invoice. Row click or `?open=<id>` shows the lines. */
export function SaleReturnsTable({ returns }: { returns: SaleReturn[] }) {
  const [detail, setDetail] = useState<SaleReturn | null>(null);

  const columns = useMemo<ColumnDef<SaleReturn>[]>(
    () => [
      {
        accessorKey: 'returnNumber',
        header: 'S-Return ID',
        cell: ({ getValue }) => (getValue() as string | undefined) ?? '—',
        // Numeric, so 10 sorts after 9 rather than after 1.
        sortingFn: (a, b) => Number(a.original.returnNumber ?? 0) - Number(b.original.returnNumber ?? 0),
      },
      { accessorKey: 'returnDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      { id: 'partyType', header: 'Party Type', accessorFn: () => 'CUSTOMER', cell: () => <Badge variant="outline">CUSTOMER</Badge> },
      { id: 'party', header: 'Party', accessorFn: (r) => r.customerName ?? 'Walk-in' },
      { accessorKey: 'total', header: 'Amount', cell: ({ row }) => money(row.original.total ?? 0) },
      { id: 'settlement', header: 'Settlement', accessorFn: settlementLabel },
      { id: 'invoice', header: 'Invoice', accessorFn: (r) => r.invoiceNumber ?? '', cell: ({ row }) => invoiceLink(row.original) },
      { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => (getValue() as string | undefined) || <span className="text-muted-foreground">—</span> },
    ],
    [],
  );

  return (
    <>
      <DataTable columns={columns} data={returns} searchPlaceholder="Search returns..." onRowClick={(row) => setDetail(row)} />
      <Suspense fallback={null}>
        <OpenFromUrl onOpen={(id) => setDetail(returns.find((r) => r.id === id) ?? null)} />
      </Suspense>
      <SaleReturnDetailDialog value={detail} onOpenChange={(open) => !open && setDetail(null)} />
    </>
  );
}

function SaleReturnDetailDialog({ value: r, onOpenChange }: { value: SaleReturn | null; onOpenChange: (open: boolean) => void }) {
  const fields: Array<[string, React.ReactNode]> = r
    ? [
        ['S-Return ID', r.returnNumber ?? '—'],
        ['Customer', r.customerName ?? 'Walk-in'],
        ['Date', new Date(r.returnDate).toLocaleDateString()],
        ['Amount', <span key="a" className="font-semibold tabular-nums">{money(r.total ?? 0)}</span>],
        ['Invoice', invoiceLink(r)],
        ['Settlement', settlementLabel(r)],
        ['Reason', r.reason || '—'],
        ['Notes', r.notes || '—'],
      ]
    : [];
  const lines = (r?.items ?? []).flatMap((i) => [
    ...i.batchAllocations.map((b) => ({ key: `${i.productId}:${b.batchId}`, product: i.productName, ...b })),
    ...(i.bonusAllocations ?? []).map((b) => ({ key: `${i.productId}:bonus:${b.batchId}`, product: `${i.productName} (bonus)`, ...b })),
  ]);

  return (
    <Dialog open={r !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>S-Return {r?.returnNumber ?? ''}</DialogTitle>
        </DialogHeader>
        {r && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="mb-2 text-sm font-medium">Returned items</h3>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell>{l.product}</TableCell>
                        <TableCell>{l.batchNumber}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                        <TableCell>{l.condition ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.total != null ? money(l.total) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
