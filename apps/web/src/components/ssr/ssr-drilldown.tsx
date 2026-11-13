'use client';

import Link from 'next/link';
import {
  Badge,
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
} from '@medicore/ui';
import { useSsrInvoices } from '@/hooks/use-ssr';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  product: { id: string; label: string } | null;
  params: Record<string, string | undefined>;
  onClose: () => void;
}

export function SsrDrilldown({ product, params, onClose }: Props) {
  const { data: invoices = [], isLoading } = useSsrInvoices(product?.id ?? null, params);
  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent expandable className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoices: {product?.label}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No invoices for these filters.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Returned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link className="text-primary underline-offset-2 hover:underline" href={`/sales?open=${i.id}`}>
                      {i.invoiceNumber}
                    </Link>
                    {i.voided && <Badge variant="secondary" className="ml-2">Voided</Badge>}
                  </TableCell>
                  <TableCell>{new Date(i.date).toLocaleDateString('en-GB')}</TableCell>
                  <TableCell>{i.customerName}</TableCell>
                  <TableCell>
                    {i.batches.length ? i.batches.map((b) => `${b.batchNumber} (${b.quantity})`).join(', ') : '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{i.unitsSold}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(i.value)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.unitsReturned ? `${i.unitsReturned} (${money(i.returnsValue)})` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
