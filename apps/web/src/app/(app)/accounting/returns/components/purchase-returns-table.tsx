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
import type { PurchaseReturn } from '@medicore/shared-types';
import { settlementLabel } from './sale-returns-table';

const money = (n: number) => n.toFixed(2);

const purchaseLink = (r: PurchaseReturn) =>
  r.purchaseNumber ? (
    <Link href={`/purchases?open=${r.purchaseId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
      {r.purchaseNumber}
    </Link>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

/** Recorded purchase returns, laid out like the sale returns list: id, date, party, amount, settlement, purchase. Row click or `?open=<id>` shows the lines. */
export function PurchaseReturnsTable({ returns, onFilteredRowsChange }: { returns: PurchaseReturn[]; onFilteredRowsChange?: (rows: PurchaseReturn[]) => void }) {
  const [detail, setDetail] = useState<PurchaseReturn | null>(null);

  const columns = useMemo<ColumnDef<PurchaseReturn>[]>(
    () => [
      {
        accessorKey: 'returnNumber',
        header: 'P-Return ID',
        cell: ({ getValue }) => (getValue() as string | undefined) ?? '—',
        // Numeric, so 10 sorts after 9 rather than after 1.
        sortingFn: (a, b) => Number(a.original.returnNumber ?? 0) - Number(b.original.returnNumber ?? 0),
      },
      { accessorKey: 'returnDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      { id: 'partyType', header: 'Party Type', accessorFn: () => 'VENDOR', cell: () => <Badge variant="outline">VENDOR</Badge> },
      { id: 'party', header: 'Party', accessorFn: (r) => r.vendorName ?? '—' },
      { accessorKey: 'total', header: 'Amount', cell: ({ row }) => money(row.original.total ?? 0) },
      { id: 'settlement', header: 'Settlement', accessorFn: settlementLabel },
      { id: 'purchase', header: 'Purchase', accessorFn: (r) => r.purchaseNumber ?? '', cell: ({ row }) => purchaseLink(row.original) },
      { accessorKey: 'reason', header: 'Reason', cell: ({ getValue }) => (getValue() as string | undefined) || <span className="text-muted-foreground">—</span> },
    ],
    [],
  );

  return (
    <>
      <DataTable columns={columns} data={returns} onFilteredRowsChange={onFilteredRowsChange} searchPlaceholder="Search returns..." onRowClick={(row) => setDetail(row)} />
      <Suspense fallback={null}>
        <OpenFromUrl onOpen={(id) => setDetail(returns.find((r) => r.id === id) ?? null)} />
      </Suspense>
      <PurchaseReturnDetailDialog value={detail} onOpenChange={(open) => !open && setDetail(null)} />
    </>
  );
}

function PurchaseReturnDetailDialog({ value: r, onOpenChange }: { value: PurchaseReturn | null; onOpenChange: (open: boolean) => void }) {
  const fields: Array<[string, React.ReactNode]> = r
    ? [
        ['P-Return ID', r.returnNumber ?? '—'],
        ['Vendor', r.vendorName ?? '—'],
        ['Date', new Date(r.returnDate).toLocaleDateString()],
        ['Amount', <span key="a" className="font-semibold tabular-nums">{money(r.total ?? 0)}</span>],
        ['Purchase', purchaseLink(r)],
        ['Settlement', settlementLabel(r)],
        ['Reason', r.reason || '—'],
        ['Notes', r.notes || '—'],
      ]
    : [];

  return (
    <Dialog open={r !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>P-Return {r?.returnNumber ?? ''}</DialogTitle>
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
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.items.map((i) => (
                      <TableRow key={`${i.productId}:${i.batchId}`}>
                        <TableCell>{i.productName ?? i.productId}</TableCell>
                        <TableCell>{i.batchNumber ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.total != null ? money(i.total) : '—'}</TableCell>
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
