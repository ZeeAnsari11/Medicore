'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { BranchField } from '@/components/branch-field';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { useAccounts } from '@/hooks/use-accounts';
import { useCustomers } from '@/hooks/use-customers';
import { useVendors } from '@/hooks/use-vendors';
import { useJournalEntries } from '@/hooks/use-journal-entries';
import { ApiError } from '@/lib/api-client';
import { PartyType } from '@medicore/shared-types';
import type { CreateManualJournalEntryLineRequest } from '@medicore/shared-types';

interface JournalEntryDialogProps {
  open: boolean;
  branchId: string | null;
  onOpenChange: (open: boolean) => void;
}

interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
  partyType: PartyType | '';
  partyId: string;
  description: string;
}

const EMPTY_LINE: LineDraft = { accountId: '', debit: '', credit: '', partyType: '', partyId: '', description: '' };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function JournalEntryDialog({ open, branchId, onOpenChange }: JournalEntryDialogProps) {
  const { accounts } = useAccounts();
  const { customers } = useCustomers();
  const { vendors } = useVendors();
  const { create, isCreating, createError, createOpeningBalance, isCreatingOpeningBalance, openingBalanceError } =
    useJournalEntries(branchId);
  const branch = useBranchFieldValue(open);

  const [entryType, setEntryType] = useState<'manual' | 'opening'>('manual');
  const [entryDate, setEntryDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  const resetForm = () => {
    setEntryType('manual');
    setEntryDate(todayISO());
    setDescription('');
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));
  const updateLine = (index: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const totalDebit = useMemo(() => lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0), [lines]);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const canSubmit =
    isBalanced &&
    (entryType === 'manual' ? description.trim().length > 0 : true) &&
    lines.every((l) => l.accountId && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0));

  const isSubmitting = entryType === 'manual' ? isCreating : isCreatingOpeningBalance;
  const error = entryType === 'manual' ? createError : openingBalanceError;

  const handleSubmit = async () => {
    if (!branch.require()) return;
    const requestLines: CreateManualJournalEntryLineRequest[] = lines.map((l) => ({
      accountId: l.accountId,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      partyType: l.partyType || undefined,
      partyId: l.partyType ? l.partyId || undefined : undefined,
      description: l.description || undefined,
    }));

    if (entryType === 'manual') {
      await create({ branchId: branch.value, entryDate, description: description.trim(), lines: requestLines });
    } else {
      await createOpeningBalance({ branchId: branch.value, entryDate, description: description.trim() || undefined, lines: requestLines });
    }
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error instanceof ApiError ? error.message : 'An error occurred'}</span>
          </Alert>
        )}

        <div className="space-y-4">
          <BranchField field={branch.field} value={branch.value} onChange={branch.setValue} error={branch.error} />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Entry Type</Label>
              <Select value={entryType} onValueChange={(v) => setEntryType(v as 'manual' | 'opening')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="opening">Opening Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description {entryType === 'opening' && '(optional)'}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this entry for?" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <Badge variant={isBalanced ? 'outline' : 'destructive'}>
                Debit {totalDebit.toFixed(2)} / Credit {totalCredit.toFixed(2)}
              </Badge>
            </div>

            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-3">
                    <Select value={line.accountId} onValueChange={(v) => updateLine(index, { accountId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Debit"
                      value={line.debit}
                      onChange={(e) => updateLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Credit"
                      value={line.credit}
                      onChange={(e) => updateLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={line.partyType || '__none__'}
                      onValueChange={(v) => updateLine(index, { partyType: v === '__none__' ? '' : (v as PartyType), partyId: '' })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Party" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No party</SelectItem>
                        <SelectItem value={PartyType.CUSTOMER}>Customer</SelectItem>
                        <SelectItem value={PartyType.VENDOR}>Vendor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {line.partyType && (
                      <Select value={line.partyId} onValueChange={(v) => updateLine(index, { partyId: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {(line.partyType === PartyType.CUSTOMER ? customers : vendors).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {line.partyType === PartyType.CUSTOMER ? (p as { name: string }).name : (p as { company: string }).company}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" disabled={lines.length <= 2} onClick={() => removeLine(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? 'Posting...' : 'Post Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
