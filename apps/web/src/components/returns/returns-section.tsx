'use client';

import {
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
} from '@medicore/ui';
import type { PurchaseReturn, SaleReturn } from '@medicore/shared-types';
import { useDocumentPdf } from '@/hooks/use-document-pdf';

interface Props {
  kind: 'purchase' | 'sale';
  docId: string;
  branchId: string | null;
  returns: Array<SaleReturn | PurchaseReturn>;
}

function quantityOf(ret: SaleReturn | PurchaseReturn): number {
  if ('purchaseId' in ret) return ret.items.reduce((sum, i) => sum + i.quantity, 0);
  return ret.items.reduce(
    (sum, i) => sum + [...i.batchAllocations, ...(i.bonusAllocations ?? [])].reduce((s, a) => s + a.quantity, 0),
    0,
  );
}

/** Distinct product names on a return, in order. */
const namesOf = (ret: SaleReturn | PurchaseReturn): string[] => [...new Set(ret.items.map((i) => i.productName).filter((n): n is string => !!n))];

/** The first two names, then "+N more" (the full list is the tooltip), so a many-line return doesn't widen the dialog. */
function productsLabel(ret: SaleReturn | PurchaseReturn): string {
  const names = namesOf(ret);
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

/** The "Returns" block on a purchase / sale detail: one row per return with a printable slip. */
export function ReturnsSection({ kind, docId, branchId, returns }: Props) {
  const { openPdf, isOpening } = useDocumentPdf();
  if (returns.length === 0) return null;

  const openSlip = (returnId: string) => {
    const query = branchId ? `?branchId=${branchId}` : '';
    void openPdf(`/${kind === 'purchase' ? 'purchases' : 'sales'}/${docId}/returns/${returnId}/pdf${query}`);
  };

  return (
    <div className="space-y-2">
      <Label>Returns</Label>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.map((ret) => (
              <TableRow key={ret.id}>
                <TableCell className="font-medium">
                  {ret.returnNumber ?? '—'}
                  {ret.kind === 'CANCELLATION' && <Badge variant="outline" className="ml-2">Remainder</Badge>}
                </TableCell>
                <TableCell className="max-w-48 truncate text-sm" title={namesOf(ret).join(', ')}>{productsLabel(ret) || '—'}</TableCell>
                <TableCell className="text-sm">{new Date(ret.returnDate).toLocaleDateString()}</TableCell>
                <TableCell>{quantityOf(ret)}</TableCell>
                <TableCell className="tabular-nums">{(ret.total ?? 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" disabled={isOpening} onClick={() => openSlip(ret.id)}>
                    Slip
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
