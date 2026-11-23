'use client';

import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@medicore/ui';
import type { Expense } from '@medicore/shared-types';
import Link from 'next/link';
import { useBranches } from '@/hooks/use-branches';
import { PAYMENT_METHOD_LABEL, formatAmount } from '../expense-utils';

/** Read-only view of one expense, opened by clicking its row: what it was for, how much, how it was paid and where. */
export function ExpenseDetailDialog({
  expense,
  onOpenChange,
}: {
  expense: Expense | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { branches } = useBranches();
  const fields: Array<[string, React.ReactNode]> = expense
    ? [
        ['Expense ID', expense.expenseNumber ?? '—'],
        ['Date', new Date(expense.expenseDate).toLocaleDateString()],
        ['Branch', branches.find((b) => b.id === expense.branchId)?.name ?? '—'],
        [
          'Exp Category',
          <span key="c" className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {expense.categoryName ?? expense.expenseAccountName ?? '—'}
            </Badge>
          </span>,
        ],
        ['Exp Sub Category', expense.subCategoryName ?? '—'],
        [
          'Amount',
          <span key="a" className="font-semibold tabular-nums">
            {formatAmount(expense.amount)}
          </span>,
        ],
        expense.source === 'CASH_RECEIPT'
          ? [
              'Settled against',
              expense.invoiceNumber ? (
                <span key="inv">
                  Invoice{' '}
                  <Link href={`/sales?open=${expense.invoiceId ?? ''}`} className="text-primary hover:underline">
                    {expense.invoiceNumber}
                  </Link>{' '}
                  (cash receipt difference)
                </span>
              ) : (
                'Cash receipt difference'
              ),
            ]
          : ['Paid by', expense.paymentMethod ? (PAYMENT_METHOD_LABEL[expense.paymentMethod] ?? expense.paymentMethod) : '—'],
        ['Paid from', expense.paymentAccountName ?? '—'],
        ['Vendor', expense.vendorName ?? '—'],
        ['Reference', expense.reference || '—'],
      ]
    : [];

  return (
    <Dialog open={expense !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Expense {expense?.expenseNumber ?? ''}</DialogTitle>
          <DialogDescription>{expense?.description}</DialogDescription>
        </DialogHeader>
        {expense && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
