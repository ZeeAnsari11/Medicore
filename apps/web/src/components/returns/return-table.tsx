'use client';

import {
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { ReturnCondition } from '@medicore/shared-types';
import { CONDITION_LABELS, type ReturnMode } from './use-return-mode';

/** The line-items table in return mode: tick lines, edit the return qty, see each line's return amount. */
export function ReturnTable({ ret }: { ret: ReturnMode }) {
  // The bonus columns appear only when the invoice gave free units.
  const hasBonus = ret.rows.some((r) => r.bonusOriginal > 0);
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all"
                checked={ret.headerState}
                onCheckedChange={ret.toggleAll}
              />
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Qty</TableHead>
            {hasBonus && <TableHead>Bonus</TableHead>}
            <TableHead>Returned</TableHead>
            <TableHead>Return qty</TableHead>
            {hasBonus && <TableHead>Return bonus</TableHead>}
            <TableHead>Return amount</TableHead>
            {ret.kind === 'sale' && <TableHead>Condition</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ret.rows.map((r) => {
            const done = r.returnable <= 0 && r.bonusReturnable <= 0;
            return (
              <TableRow key={r.key} className={done ? 'opacity-50' : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Return ${r.productName}`}
                    disabled={done}
                    checked={ret.ticked(r)}
                    onCheckedChange={() => ret.toggle(r)}
                  />
                </TableCell>
                <TableCell className="font-medium">{r.productName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.batchNumber}</TableCell>
                <TableCell>{r.original}</TableCell>
                {hasBonus && <TableCell>{r.bonusOriginal || '—'}</TableCell>}
                <TableCell>
                  {r.returned || r.bonusReturned
                    ? `${r.returned || 0}${r.bonusReturned ? ` (+${r.bonusReturned} bonus)` : ''}`
                    : '—'}
                </TableCell>
                <TableCell className="w-28">
                  {done ? (
                    <span className="text-xs text-muted-foreground">{r.returned >= r.original ? 'Fully returned' : 'Sold, in stock: 0'}</span>
                  ) : r.returnable <= 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      max={r.returnable}
                      step="any"
                      disabled={!ret.ticked(r)}
                      value={ret.qtyInput(r)}
                      onChange={(e) => ret.setRowQty(r, e.target.value)}
                    />
                  )}
                </TableCell>
                {hasBonus && (
                  <TableCell className="w-28">
                    {r.bonusReturnable <= 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={r.bonusReturnable}
                        step="any"
                        aria-label={`Return bonus ${r.productName}`}
                        disabled={!ret.ticked(r)}
                        value={ret.bonusInput(r)}
                        onChange={(e) => ret.setRowBonus(r, e.target.value)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="tabular-nums">{ret.ticked(r) ? ret.amountOf(r).toFixed(2) : '—'}</TableCell>
                {ret.kind === 'sale' && (
                  <TableCell className="w-32">
                    <Select
                      value={ret.condition[r.key] ?? ReturnCondition.RESTOCK}
                      onValueChange={(v) => ret.setCondition(r, v as ReturnCondition)}
                      disabled={!ret.ticked(r)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ReturnCondition).map((c) => (
                          <SelectItem key={c} value={c}>{CONDITION_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
