'use client';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@medicore/ui';
import { PaymentMethod, ReturnReasonCode, ReturnSettlementMode } from '@medicore/shared-types';
import { REASON_LABELS, type ReturnMode } from './use-return-mode';

/** Reason / notes / money choice and the live summary shown under the table in return mode. */
export function ReturnSummary({ ret }: { ret: ReturnMode }) {
  const { summary: s } = ret;
  const party = ret.kind === 'sale' ? 'customer' : 'vendor';

  return (
    <div className="space-y-4">
      {ret.invalid && (
        <p className="text-xs text-destructive">Return quantities must be between 1 and what can still be returned.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Reason *</Label>
          <Select value={ret.reasonCode} onValueChange={(v) => ret.setReasonCode(v as ReturnReasonCode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ReturnReasonCode).map((c) => (
                <SelectItem key={c} value={c}>{REASON_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Notes (optional)</Label>
          <textarea
            className="min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={1}
            value={ret.notes}
            onChange={(e) => ret.setNotes(e.target.value)}
          />
        </div>
      </div>

      {s.excess > 0 && (
        <div className="space-y-1.5">
          <Label>
            Excess {s.excess.toFixed(2)} over the outstanding balance
          </Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={ret.mode} onValueChange={(v) => ret.setMode(v as ReturnSettlementMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ReturnSettlementMode.ADJUST}>Keep as {party} credit</SelectItem>
                <SelectItem value={ReturnSettlementMode.REFUND}>Refund now</SelectItem>
              </SelectContent>
            </Select>
            {ret.mode === ReturnSettlementMode.REFUND && (
              <Select value={ret.method} onValueChange={(v) => ret.setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PaymentMethod.CASH}>Cash</SelectItem>
                  <SelectItem value={PaymentMethod.CARD}>Card</SelectItem>
                  <SelectItem value={PaymentMethod.BANK_TRANSFER}>Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      <div className="ml-auto max-w-sm space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
        <div className="flex justify-between font-medium"><span>Return total</span><span>{s.returnTotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">New net total</span><span>{s.newNet.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">New paid</span><span>{s.newPaid.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">New outstanding</span><span>{s.newOutstanding.toFixed(2)}</span></div>
        <p className="pt-1 text-xs text-muted-foreground">
          {s.excess <= 0
            ? 'Adjusted against the outstanding balance.'
            : s.refund > 0
              ? `Adjusted against outstanding; ${s.refund.toFixed(2)} refunded now.`
              : `Adjusted against outstanding; excess ${s.excess.toFixed(2)} becomes ${party} credit.`}
        </p>
      </div>
    </div>
  );
}
