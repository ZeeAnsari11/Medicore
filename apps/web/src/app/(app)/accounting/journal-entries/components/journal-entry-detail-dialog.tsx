'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@medicore/ui';
import { JournalEntryStatus } from '@medicore/shared-types';
import type { JournalEntry } from '@medicore/shared-types';

interface JournalEntryDetailDialogProps {
  entry: JournalEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function JournalEntryDetailDialog({ entry, onOpenChange }: JournalEntryDetailDialogProps) {
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry?.entryNumber}
            {entry && (
              <Badge variant={entry.status === JournalEntryStatus.REVERSED ? 'secondary' : 'outline'}>{entry.status}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {entry && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Date: </span>
                {new Date(entry.entryDate).toLocaleDateString()}
              </div>
              <div>
                <span className="text-muted-foreground">Source: </span>
                {entry.sourceType.replace(/_/g, ' ')}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Description: </span>
                {entry.description}
              </div>
              {entry.reversalOfEntryId && (
                <div className="col-span-2 text-muted-foreground">Reverses entry {entry.reversalOfEntryId}</div>
              )}
              {entry.reversedByEntryId && (
                <div className="col-span-2 text-muted-foreground">Reversed by entry {entry.reversedByEntryId}</div>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell>{line.accountName ?? line.accountId}</TableCell>
                    <TableCell>{line.partyName ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.debit > 0 ? line.debit.toFixed(2) : ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.credit > 0 ? line.credit.toFixed(2) : ''}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-medium tabular-nums">{entry.totalDebit.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{entry.totalCredit.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
