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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { BranchField } from '@/components/branch-field';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { useAccounts } from '@/hooks/use-accounts';
import { useVendors } from '@/hooks/use-vendors';
import { useExpenses } from '@/hooks/use-expenses';
import { ApiError } from '@/lib/api-client';
import { PaymentMethod, AccountType } from '@medicore/shared-types';

interface ExpenseDialogProps {
  open: boolean;
  branchId: string | null;
  onOpenChange: (open: boolean) => void;
}

const NON_PAYMENT_SYSTEM_KEYS = new Set(['ACCOUNTS_RECEIVABLE', 'INVENTORY', 'VENDOR_ADVANCES']);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseDialog({ open, branchId, onOpenChange }: ExpenseDialogProps) {
  const { accounts } = useAccounts();
  const { vendors } = useVendors();
  const { create, isCreating, createError } = useExpenses(branchId);
  const branch = useBranchFieldValue(open);

  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');

  const resetForm = () => {
    setExpenseAccountId('');
    setAmount('');
    setExpenseDate(todayISO());
    setPaymentMethod(PaymentMethod.CASH);
    setPaymentAccountId('');
    setVendorId('');
    setDescription('');
    setReference('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const expenseAccounts = useMemo(() => accounts.filter((a) => a.type === AccountType.EXPENSE && a.isActive), [accounts]);
  const paymentAccounts = useMemo(
    () => accounts.filter((a) => a.type === AccountType.ASSET && a.isActive && !NON_PAYMENT_SYSTEM_KEYS.has(a.systemKey ?? '')),
    [accounts],
  );

  const amountNum = Number(amount) || 0;
  const canSubmit = expenseAccountId && amountNum > 0 && paymentAccountId && description.trim();

  const handleSubmit = async () => {
    if (!branch.require()) return;
    await create({
      branchId: branch.value,
      expenseAccountId,
      amount: amountNum,
      expenseDate,
      paymentMethod,
      paymentAccountId,
      vendorId: vendorId || undefined,
      description: description.trim(),
      reference: reference || undefined,
    });
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record an Expense</DialogTitle>
        </DialogHeader>

        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{createError instanceof ApiError ? createError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <div className="space-y-4">
          <BranchField field={branch.field} value={branch.value} onChange={branch.setValue} error={branch.error} />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Expense Category</Label>
              <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
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
            <div className="space-y-1.5">
              <Label>Paid From</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor (optional)</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this expense for?" />
          </div>

          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input placeholder="Optional" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || isCreating} onClick={handleSubmit}>
            {isCreating ? 'Saving...' : 'Record Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
