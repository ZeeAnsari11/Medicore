'use client';

import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Alert,
  Badge,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { BranchField } from '@/components/branch-field';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { useCustomers } from '@/hooks/use-customers';
import { useVendors } from '@/hooks/use-vendors';
import { useSales } from '@/hooks/use-sales';
import { usePurchases } from '@/hooks/use-purchases';
import { useAccounts } from '@/hooks/use-accounts';
import { CustomerName } from '@/lib/party-label';
import { usePayments } from '@/hooks/use-payments';
import { ApiError } from '@/lib/api-client';
import { PartyType, PaymentMethod, InvoiceType, AccountType } from '@medicore/shared-types';
import type { CreatePaymentAllocationRequest } from '@medicore/shared-types';

interface PaymentDialogProps {
  /** CUSTOMER = a sale receipt, VENDOR = a payment to a vendor. */
  partyType: PartyType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NON_PAYMENT_SYSTEM_KEYS = new Set(['ACCOUNTS_RECEIVABLE', 'INVENTORY', 'VENDOR_ADVANCES']);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentDialog({ partyType, open, onOpenChange }: PaymentDialogProps) {
  // The dialog's own Branch field (main branch pre-selected, locked for branch users): only that branch's customers / vendors are listed.
  const branch = useBranchFieldValue(open, { preselect: true });
  const branchId = branch.value || null;
  const { customers } = useCustomers(undefined, branchId);
  const { vendors } = useVendors(undefined, branchId);
  const { accounts } = useAccounts();
  const { create, isCreating, createError } = usePayments(branchId);

  const isReceipt = partyType === PartyType.CUSTOMER;
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Record<string, number>>({});

  const resetForm = () => {
    setPartyId('');
    setAmount('');
    setMethod(PaymentMethod.CASH);
    setPaymentDate(todayISO());
    setNotes('');
    setSelectedInvoiceIds({});
  };

  const handleBranchChange = (next: string) => {
    branch.setValue(next);
    setPartyId('');
    setSelectedInvoiceIds({});
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const paymentAccounts = useMemo(
    () => accounts.filter((a) => a.type === AccountType.ASSET && a.isActive && !NON_PAYMENT_SYSTEM_KEYS.has(a.systemKey ?? '')),
    [accounts],
  );

  const { sales } = useSales(branchId, partyType === PartyType.CUSTOMER ? partyId : undefined);
  const { purchases } = usePurchases(branchId, partyType === PartyType.VENDOR ? partyId : undefined);

  const openInvoices = useMemo(() => {
    if (!partyId) return [];
    if (partyType === PartyType.CUSTOMER) {
      return sales
        .filter((s) => s.grandTotal - s.amountPaid > 0.01)
        .map((s) => ({
          invoiceType: InvoiceType.SALE,
          invoiceId: s.id,
          invoiceNumber: s.invoiceNumber,
          outstanding: s.grandTotal - s.amountPaid,
        }));
    }
    return purchases
      .filter((p) => p.grandTotal - p.amountPaid > 0.01)
      .map((p) => ({
        invoiceType: InvoiceType.PURCHASE,
        invoiceId: p.id,
        invoiceNumber: p.purchaseNumber,
        outstanding: p.grandTotal - p.amountPaid,
      }));
  }, [partyId, partyType, sales, purchases]);

  // No account to pick: cash goes to the Cash account, card and bank transfer to the Bank account.
  const accountId = useMemo(() => {
    const key = method === PaymentMethod.CASH ? 'CASH' : 'BANK';
    return paymentAccounts.find((a) => a.systemKey === key)?.id ?? '';
  }, [paymentAccounts, method]);

  const amountNum = Number(amount) || 0;
  const allocatedTotal = Object.values(selectedInvoiceIds).reduce((sum, v) => sum + v, 0);
  const remainder = amountNum - allocatedTotal;

  const toggleInvoice = (invoiceId: string, outstanding: number) => {
    setSelectedInvoiceIds((prev) => {
      const next = { ...prev };
      if (invoiceId in next) {
        delete next[invoiceId];
      } else {
        const available = Math.max(amountNum - allocatedTotal, 0);
        next[invoiceId] = Math.min(outstanding, available);
      }
      return next;
    });
  };

  const setInvoiceAmount = (invoiceId: string, value: number) => {
    setSelectedInvoiceIds((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const handleSubmit = async () => {
    const allocations: CreatePaymentAllocationRequest[] = openInvoices
      .filter((inv) => selectedInvoiceIds[inv.invoiceId] > 0)
      .map((inv) => ({ invoiceType: inv.invoiceType, invoiceId: inv.invoiceId, amount: selectedInvoiceIds[inv.invoiceId] }));

    await create({
      // No branchId: a payment lands in the branch of the party it pays.
      partyType,
      partyId,
      amount: amountNum,
      method,
      accountId,
      paymentDate,
      notes: notes || undefined,
      allocations: allocations.length > 0 ? allocations : undefined,
    });
    resetForm();
    onOpenChange(false);
  };

  const canSubmit = partyId && amountNum > 0 && accountId && remainder >= -0.01;

  // Money not tied to a bill is held as an advance; the saved description says so unless the user writes their own.
  const isAdvance = !!partyId && amountNum > 0 && remainder > 0.005;
  const advanceLabel =
    allocatedTotal > 0.005
      ? `Includes advance of ${remainder.toFixed(2)}`
      : partyType === PartyType.CUSTOMER
        ? 'Advance received'
        : 'Advance payment';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isReceipt ? 'Record a Sale Receipt' : 'Record a Payment'}</DialogTitle>
        </DialogHeader>

        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{createError instanceof ApiError ? createError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BranchField field={branch.field} value={branch.value} onChange={handleBranchChange} error={branch.error} id="paymentBranch" />
            <div className="space-y-1.5">
              <Label>{partyType === PartyType.CUSTOMER ? 'Customer' : 'Vendor'}</Label>
              <Select value={partyId} onValueChange={setPartyId} disabled={!branchId}>
                <SelectTrigger>
                  <SelectValue placeholder={branchId ? `Select a ${partyType === PartyType.CUSTOMER ? 'customer' : 'vendor'}` : 'Select a branch first'} />
                </SelectTrigger>
                <SelectContent>
                  {(partyType === PartyType.CUSTOMER ? customers : vendors).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {partyType === PartyType.CUSTOMER ? <CustomerName name={(p as { name: string }).name} territory={(p as { territory?: string }).territory} /> : (p as { company: string }).company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PaymentMethod.CASH}>Cash</SelectItem>
                  <SelectItem value={PaymentMethod.CARD}>Card</SelectItem>
                  <SelectItem value={PaymentMethod.BANK_TRANSFER}>Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description / notes</Label>
              <Input
                placeholder={isAdvance ? advanceLabel : 'Optional'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {isAdvance && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              <span className="font-semibold tabular-nums">{remainder.toFixed(2)}</span>{' '}
              {partyType === PartyType.CUSTOMER ? 'will be held as an advance from' : 'will be held as an advance with'} this{' '}
              {partyType === PartyType.CUSTOMER ? 'customer' : 'vendor'}. It is saved as &ldquo;{notes.trim() || advanceLabel}&rdquo;
              {partyType === PartyType.CUSTOMER ? ', and offered on their next sale.' : ', and offered on your next purchase from them.'}
            </div>
          )}

          {partyId && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Allocate to open invoices (optional)</h4>
                <Badge variant={remainder < -0.01 ? 'destructive' : 'outline'}>
                  {remainder >= 0 ? `Remainder → advance: ${remainder.toFixed(2)}` : `Over-allocated by ${Math.abs(remainder).toFixed(2)}`}
                </Badge>
              </div>
              {openInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open invoices for this party — the full amount will post as an advance.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {openInvoices.map((inv) => {
                    const checked = inv.invoiceId in selectedInvoiceIds;
                    return (
                      <div key={inv.invoiceId} className="flex items-center gap-3 text-sm">
                        <Checkbox checked={checked} onCheckedChange={() => toggleInvoice(inv.invoiceId, inv.outstanding)} />
                        <span className="flex-1">{inv.invoiceNumber}</span>
                        <span className="text-muted-foreground">Outstanding: {inv.outstanding.toFixed(2)}</span>
                        {checked && (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-28"
                            value={selectedInvoiceIds[inv.invoiceId]}
                            onChange={(e) => setInvoiceAmount(inv.invoiceId, Number(e.target.value))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || isCreating} onClick={handleSubmit}>
            {isCreating ? 'Saving...' : isReceipt ? 'Record Receipt' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
