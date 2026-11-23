'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import type { LedgerPage, LedgerReference, LedgerRow } from '@medicore/shared-types';
import type { PartyKind } from '@/hooks/use-ledgers';

const PAGE_SIZES = [25, 50, 100, 200];
const money = (n: number) => n.toFixed(2);

/** Where a document opens. Sales and purchases open their detail dialog via ?open=. */
export function documentHref(ref: LedgerReference): string {
  switch (ref.type) {
    case 'SALE':
      return `/sales?open=${ref.id}`;
    case 'PURCHASE':
      return `/purchases?open=${ref.id}`;
    case 'PAYMENT':
      return `/accounting/payments?open=${ref.id}`;
    case 'SALE_RETURN':
      return `/accounting/returns?open=${ref.id}`;
    case 'PURCHASE_RETURN':
      return `/accounting/returns?mode=purchase&open=${ref.id}`;
    default:
      return '/accounting/expenses';
  }
}

interface LedgerTableProps {
  variant: 'gl' | 'party';
  /** Party ledgers only: names the document column after what the party is billed with. */
  partyKind?: PartyKind;
  ledger: LedgerPage;
  closingLabel: string;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export function LedgerTable({ variant, partyKind, ledger, closingLabel, isFetching, onPageChange, onLimitChange }: LedgerTableProps) {
  const pageCount = Math.max(1, Math.ceil(ledger.total / ledger.limit));
  const columnCount = variant === 'gl' ? 7 : 7;

  const entryLink = (row: LedgerRow) => (
    <Link href={`/accounting/journal-entries?open=${row.entryId}`} className="text-primary hover:underline">
      {row.entryNumber}
    </Link>
  );
  const referenceLink = (row: LedgerRow) =>
    row.reference ? (
      <Link href={documentHref(row.reference)} className="text-primary hover:underline">
        {row.reference.number}
      </Link>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  /** A payment row's invoice number, linked: a customer payment opens its invoice view-only with that payment marked. */
  const invoiceLink = (row: LedgerRow, inv: NonNullable<LedgerRow['invoices']>[number]) => (
    <Link
      key={inv.id}
      href={
        inv.type === 'SALE' && row.reference?.type === 'PAYMENT'
          ? `/sales?open=${inv.id}&readonly=1&payment=${row.reference.id}`
          : documentHref({ type: inv.type, id: inv.id, number: inv.number })
      }
      className="text-primary hover:underline"
    >
      {inv.number}
    </Link>
  );

  /** "Against invoice 0004": each invoice number in a payment's description is the link to that invoice. */
  /** A cash receipt's "Difference 5.00" note stands out in bold. */
  const boldDifference = (text: string): ReactNode => {
    const at = text.search(/Difference [\d,.]+/);
    if (at < 0) return text;
    const note = /Difference [\d,.]+/.exec(text)![0];
    return (
      <>
        {text.slice(0, at)}
        <b>{note}</b>
        {text.slice(at + note.length)}
      </>
    );
  };

  const descriptionCell = (row: LedgerRow) => {
    if (!row.invoices?.length) return boldDifference(row.description);
    const parts: ReactNode[] = [];
    let rest = row.description;
    for (const inv of row.invoices) {
      const at = rest.indexOf(inv.number);
      if (at < 0) continue;
      parts.push(rest.slice(0, at), invoiceLink(row, inv));
      rest = rest.slice(at + inv.number.length);
    }
    return parts.length ? <>{parts}{boldDifference(rest)}</> : boldDifference(row.description);
  };

  /** The document column: the invoice, purchase or payment (PMT-) number, else the journal entry. */
  const documentCell = (row: LedgerRow) => (row.reference ? referenceLink(row) : entryLink(row));

  return (
    <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {variant === 'gl' ? (
                <>
                  <TableHead>Entry #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Type</TableHead>
                  <TableHead>{partyKind === 'vendors' ? 'Purchase #' : 'Invoice #'}</TableHead>
                  <TableHead>Description</TableHead>
                </>
              )}
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.page === 1 && (
              <TableRow className="bg-muted/40 font-medium">
                <TableCell colSpan={columnCount - 1}>Opening balance</TableCell>
                <TableCell className="text-right tabular-nums">{money(ledger.openingBalance)}</TableCell>
              </TableRow>
            )}
            {ledger.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  No postings in this period.
                </TableCell>
              </TableRow>
            ) : (
              ledger.rows.map((row, i) => (
                <TableRow key={`${row.entryId}-${i}`}>
                  <TableCell className="whitespace-nowrap">{new Date(row.date).toLocaleDateString()}</TableCell>
                  {variant === 'gl' ? (
                    <>
                      <TableCell>{entryLink(row)}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{referenceLink(row)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>
                        <Badge variant="outline">{row.documentType}</Badge>
                      </TableCell>
                      <TableCell>{documentCell(row)}</TableCell>
                      <TableCell>{descriptionCell(row)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums">{row.debit ? money(row.debit) : ''}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.credit ? money(row.credit) : ''}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(row.runningBalance)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columnCount - 3} className="font-medium">
                Period totals ({ledger.total} {ledger.total === 1 ? 'row' : 'rows'})
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(ledger.totalDebit)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(ledger.totalCredit)}</TableCell>
              <TableCell />
            </TableRow>
            <TableRow className="font-semibold">
              <TableCell colSpan={columnCount - 1}>{closingLabel}</TableCell>
              <TableCell className="text-right tabular-nums">{money(ledger.closingBalance)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          Rows per page
          <Select value={String(ledger.limit)} onValueChange={(v) => onLimitChange(Number(v))}>
            <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center gap-3">
          <span>
            Page {ledger.page} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={ledger.page <= 1} onClick={() => onPageChange(ledger.page - 1)}>
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={ledger.page >= pageCount} onClick={() => onPageChange(ledger.page + 1)}>
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
