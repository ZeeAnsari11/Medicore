'use client';

import { useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  ComboboxWithCreate,
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
import { useExpenses } from '@/hooks/use-expenses';
import { useExpenseCategories } from '@/hooks/use-expense-categories';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiError } from '@/lib/api-client';
import { PaymentMethod, AccountType } from '@medicore/shared-types';
import { PAYMENT_METHOD_LABEL } from '../expense-utils';
import { CategoryNameDialog } from './category-name-dialog';

interface ExpenseDialogProps {
  open: boolean;
  branchId: string | null;
  onOpenChange: (open: boolean) => void;
}

const NON_PAYMENT_SYSTEM_KEYS = new Set(['ACCOUNTS_RECEIVABLE', 'INVENTORY', 'VENDOR_ADVANCES']);
const METHODS = [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.BANK_TRANSFER];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

/** Records one expense: where and when, what it was for (category, then optional sub-category), and how it was paid. */
export function ExpenseDialog({ open, branchId, onOpenChange }: ExpenseDialogProps) {
  const { accounts } = useAccounts();
  const { create, isCreating, createError } = useExpenses(branchId);
  const { categories, create: createCategory } = useExpenseCategories();
  const { has } = usePermissions();
  // The expense lands in the branch being viewed (else the main branch); the admin can still change it.
  const branch = useBranchFieldValue(open, { preselect: true });

  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paidFromPicked, setPaidFromPicked] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [quickCreate, setQuickCreate] = useState<{ kind: 'main' | 'sub'; name: string } | null>(
    null,
  );

  const resetForm = () => {
    setCategoryId('');
    setSubCategoryId('');
    setAmount('');
    setExpenseDate(todayISO());
    setPaymentMethod(PaymentMethod.CASH);
    setPaidFromPicked(null);
    setDescription('');
    setReference('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  // Categories belong to a branch: the form offers only those of the branch the expense is recorded in.
  const mains = useMemo(
    () => categories.filter((c) => c.isActive && c.branchId === branch.value),
    [categories, branch.value],
  );
  const mainOptions = useMemo(() => mains.map((c) => ({ value: c.id, label: c.name })), [mains]);
  const main = mains.find((c) => c.id === categoryId);
  const subOptions = useMemo(
    () =>
      (main?.subCategories ?? [])
        .filter((s) => s.isActive)
        .map((s) => ({ value: s.id, label: s.name })),
    [main],
  );

  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.type === AccountType.ASSET &&
          a.isActive &&
          !NON_PAYMENT_SYSTEM_KEYS.has(a.systemKey ?? ''),
      ),
    [accounts],
  );
  // Cash pays from the Cash account, Card / Bank transfer from the Bank account, until the user picks another.
  const defaultPaidFrom =
    paymentAccounts.find(
      (a) => a.systemKey === (paymentMethod === PaymentMethod.CASH ? 'CASH' : 'BANK'),
    )?.id ?? '';
  const paymentAccountId = paidFromPicked ?? defaultPaidFrom;

  const amountNum = Number(amount) || 0;
  const canSubmit = !!categoryId && !!subCategoryId && amountNum > 0 && !!paymentAccountId && !!description.trim();

  const handleSubmit = async () => {
    if (!branch.require()) return;
    await create({
      branchId: branch.value,
      categoryId,
      subCategoryId: subCategoryId || undefined,
      amount: amountNum,
      expenseDate,
      paymentMethod,
      paymentAccountId,
      description: description.trim(),
      reference: reference || undefined,
    });
    resetForm();
    onOpenChange(false);
  };

  const canCreateCategory = has('acc_expense_categories:create');

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record an Expense</DialogTitle>
            <DialogDescription>
              What was it for, how much, and where the money came from.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <span>
                {createError instanceof ApiError ? createError.message : 'An error occurred'}
              </span>
            </Alert>
          )}

          <div className="space-y-6 pt-2">
            <section className="space-y-3">
              <SectionTitle>Where &amp; when</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <BranchField
                  field={branch.field}
                  value={branch.value}
                  onChange={(id) => {
                    branch.setValue(id);
                    // The chosen category belongs to the previous branch.
                    setCategoryId('');
                    setSubCategoryId('');
                  }}
                  error={branch.error}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="expense-date">Date</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <SectionTitle>What was it for</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    Exp Category <span className="text-destructive">*</span>
                  </Label>
                  <ComboboxWithCreate
                    options={mainOptions}
                    value={categoryId}
                    onChange={(id) => {
                      setCategoryId(id);
                      setSubCategoryId('');
                    }}
                    placeholder={branch.value ? 'Select category' : 'Choose a branch first'}
                    searchPlaceholder="Search categories..."
                    emptyMessage="No categories in this branch yet."
                    disabled={!branch.value}
                    onCreateNew={
                      canCreateCategory && branch.value
                        ? (term) => setQuickCreate({ kind: 'main', name: term })
                        : undefined
                    }
                    createLabel={(term) => (term ? `New category "${term}"` : 'New category')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Exp Sub Category <span className="text-destructive">*</span>
                  </Label>
                  <ComboboxWithCreate
                    options={subOptions}
                    value={subCategoryId}
                    onChange={setSubCategoryId}
                    disabled={!main}
                    placeholder={
                      main
                        ? subOptions.length
                          ? 'Select sub-category'
                          : 'Add one with "New sub-category"'
                        : 'Choose a category first'
                    }
                    searchPlaceholder="Search sub-categories..."
                    emptyMessage="No sub-categories yet."
                    onCreateNew={
                      canCreateCategory && main
                        ? (term) => setQuickCreate({ kind: 'sub', name: term })
                        : undefined
                    }
                    createLabel={(term) =>
                      term ? `New sub-category "${term}"` : 'New sub-category'
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-amount">
                  Amount <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="h-12 text-lg font-semibold tabular-nums"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-description">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="expense-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this expense for?"
                />
              </div>
            </section>

            <section className="space-y-3">
              <SectionTitle>Payment</SectionTitle>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment method">
                  {METHODS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      variant={paymentMethod === m ? 'default' : 'outline'}
                      aria-pressed={paymentMethod === m}
                      onClick={() => {
                        setPaymentMethod(m);
                        setPaidFromPicked(null);
                      }}
                    >
                      {PAYMENT_METHOD_LABEL[m]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    Paid from <span className="text-destructive">*</span>
                  </Label>
                  <Select value={paymentAccountId} onValueChange={setPaidFromPicked}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="expense-reference">Reference</Label>
                  <Input
                    id="expense-reference"
                    placeholder="Optional (bill or receipt number)"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit || isCreating} onClick={handleSubmit}>
              {isCreating ? 'Saving...' : 'Record Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {quickCreate && (
        <CategoryNameDialog
          title={quickCreate.kind === 'main' ? 'New category' : `New sub-category of ${main?.name}`}
          description={
            quickCreate.kind === 'main'
              ? `For example Utility Bills or Salary. It belongs to ${branch.field.branches.find((b) => b.id === branch.value)?.name ?? 'this branch'}.`
              : 'For example Electricity Bill or Ali Salary. It belongs to the same branch as its category.'
          }
          label="Name"
          initialName={quickCreate.name}
          submitLabel="Create"
          onClose={() => setQuickCreate(null)}
          onSubmit={async (name) => {
            const created = await createCategory({
              name,
              parentId: quickCreate.kind === 'sub' ? categoryId : undefined,
              branchId: quickCreate.kind === 'main' ? branch.value : undefined,
            });
            if (quickCreate.kind === 'main') {
              setCategoryId(created.id);
              setSubCategoryId('');
            } else {
              setSubCategoryId(created.id);
            }
          }}
        />
      )}
    </>
  );
}
