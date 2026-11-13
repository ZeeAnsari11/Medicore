'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  type ColumnDef,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useExpenses } from '@/hooks/use-expenses';
import type { Expense } from '@medicore/shared-types';
import { ExpenseDialog } from './components/expense-dialog';


export default function ExpensesPage() {
  const router = useRouter();
  const { has } = usePermissions();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [dialogOpen, setDialogOpen] = useState(false);

  const { expenses, isLoading, error } = useExpenses(selectedBranchId);


  const columns = useMemo<ColumnDef<Expense>[]>(
    () => [
      { accessorKey: 'expenseDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      {
        accessorKey: 'expenseAccountName',
        header: 'Category',
        cell: ({ getValue }) => <Badge variant="outline">{getValue() as string}</Badge>,
      },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'vendorName', header: 'Vendor', cell: ({ getValue }) => (getValue() as string | undefined) ?? '—' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ getValue }) => (getValue() as number).toFixed(2) },
      { accessorKey: 'paymentMethod', header: 'Method' },
      { accessorKey: 'paymentAccountName', header: 'Paid From' },
      { accessorKey: 'reference', header: 'Reference' },
    ],
    [],
  );

  return (
    <PageAccessGuard requires="acc_expenses:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Expenses"
        description="Operating expenses, bank charges, and other cash outflows."
        actions={
          <div className="flex items-center gap-3">
            <Button disabled={!has('acc_expenses:create')} onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Expense
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load expenses</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <DataTable columns={columns} data={expenses} searchPlaceholder="Search expenses..." />
      )}

      <ExpenseDialog open={dialogOpen} branchId={selectedBranchId} onOpenChange={setDialogOpen} />
    </PageAccessGuard>
  );
}
