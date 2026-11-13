'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Download } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Input,
  type ColumnDef,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useTrialBalance } from '@/hooks/use-ledger-reports';
import { exportToCsv } from '@/lib/export-csv';
import type { TrialBalanceRow } from '@medicore/shared-types';


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function TrialBalancePage() {
  const router = useRouter();
  const { has } = usePermissions();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [asOfDate, setAsOfDate] = useState(todayISO());

  const { trialBalance, isLoading, error } = useTrialBalance(selectedBranchId, asOfDate);


  const columns = useMemo<ColumnDef<TrialBalanceRow>[]>(
    () => [
      { accessorKey: 'accountCode', header: 'Code' },
      { accessorKey: 'accountName', header: 'Account' },
      { accessorKey: 'type', header: 'Type', cell: ({ getValue }) => <Badge variant="outline">{getValue() as string}</Badge> },
      { accessorKey: 'debit', header: 'Debit', cell: ({ getValue }) => ((getValue() as number) > 0 ? (getValue() as number).toFixed(2) : '') },
      { accessorKey: 'credit', header: 'Credit', cell: ({ getValue }) => ((getValue() as number) > 0 ? (getValue() as number).toFixed(2) : '') },
    ],
    [],
  );

  const handleExport = () => {
    if (!trialBalance) return;
    exportToCsv(
      `trial-balance-${asOfDate}.csv`,
      trialBalance.rows.map((r) => ({
        Code: r.accountCode,
        Account: r.accountName,
        Type: r.type,
        Debit: r.debit.toFixed(2),
        Credit: r.credit.toFixed(2),
      })),
    );
  };

  return (
    <PageAccessGuard requires="acc_trial_balance:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Trial Balance"
        description="Debit and credit balance for every account, as of a date."
        actions={
          <div className="flex items-center gap-3">
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40" aria-label="As of date" />
            <Button variant="outline" onClick={handleExport} disabled={!trialBalance || !has('acc_trial_balance:export')}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load trial balance</span>
        </Alert>
      )}

      {isLoading || !trialBalance ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-6 text-sm">
            <span>
              Total Debit: <span className="font-medium tabular-nums">{trialBalance.totalDebit.toFixed(2)}</span>
            </span>
            <span>
              Total Credit: <span className="font-medium tabular-nums">{trialBalance.totalCredit.toFixed(2)}</span>
            </span>
            <Badge variant={Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.01 ? 'outline' : 'destructive'}>
              {Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 0.01 ? 'Balanced' : 'Out of balance'}
            </Badge>
          </div>
          <DataTable columns={columns} data={trialBalance.rows} searchPlaceholder="Search accounts..." />
        </div>
      )}
    </PageAccessGuard>
  );
}
