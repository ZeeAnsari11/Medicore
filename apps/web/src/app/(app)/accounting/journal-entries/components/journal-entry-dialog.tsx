'use client';

import { useState } from 'react';
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
import { useJournalEntries } from '@/hooks/use-journal-entries';
import { ApiError } from '@/lib/api-client';

interface JournalEntryDialogProps {
  open: boolean;
  branchId: string | null;
  onOpenChange: (open: boolean) => void;
}

type Direction = 'CREDIT' | 'DEBIT';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Credit adds money to cash/bank and counts as income; debit takes money out and counts as an expense. */
export function JournalEntryDialog({ open, branchId, onOpenChange }: JournalEntryDialogProps) {
  const { accounts } = useAccounts();
  const { create, isCreating, createError } = useJournalEntries(branchId);
  const branch = useBranchFieldValue(open, { preselect: true });

  const [direction, setDirection] = useState<Direction>('CREDIT');
  const [entryDate, setEntryDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const credit = direction === 'CREDIT';
  const cashId = accounts.find((a) => a.systemKey === 'CASH')?.id ?? '';
  const otherId = accounts.find((a) => a.systemKey === (credit ? 'OTHER_INCOME' : 'OTHER_EXPENSES'))?.id ?? '';
  const value = Number(amount) || 0;
  const canSubmit = value > 0 && !!cashId && !!otherId && description.trim().length > 0;

  const resetForm = () => {
    setDirection('CREDIT');
    setEntryDate(todayISO());
    setAmount('');
    setDescription('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!branch.require()) return;
    await create({
      branchId: branch.value,
      entryDate,
      description: description.trim(),
      lines: [
        { accountId: cashId, debit: credit ? value : 0, credit: credit ? 0 : value },
        { accountId: otherId, debit: credit ? 0 : value, credit: credit ? value : 0 },
      ],
    });
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Receipt</DialogTitle>
        </DialogHeader>

        {createError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{createError instanceof ApiError ? createError.message : 'An error occurred'}</span>
          </Alert>
        )}

        <div className="space-y-4">
          <BranchField field={branch.field} value={branch.value} onChange={branch.setValue} error={branch.error} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CREDIT">Credit (money in)</SelectItem>
                  <SelectItem value="DEBIT">Debit (money out)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              Description <span className="text-destructive">*</span>
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={credit ? 'e.g. Sold empty cartons' : 'e.g. Carton disposal fee'}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {credit
              ? 'Adds the amount to cash or bank and counts it as income on the Profit & Loss. Shows under Receipts on Cash Flow.'
              : 'Takes the amount out of cash or bank and counts it as an expense on the Profit & Loss. Shows under Payments on Cash Flow.'}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || isCreating} onClick={handleSubmit}>
            {isCreating ? 'Saving...' : 'Save Receipt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
