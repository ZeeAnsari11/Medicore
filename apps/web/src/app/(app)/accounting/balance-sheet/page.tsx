'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useBalanceSheet } from '@/hooks/use-ledger-reports';
import type { BalanceSheetRow } from '@medicore/shared-types';


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function Section({ title, rows, total }: { title: string; rows: BalanceSheetRow[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.accountId}>
                <TableCell>{row.accountName}</TableCell>
                <TableCell className="text-right tabular-nums">{row.amount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-medium">Total {title}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{total.toFixed(2)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function BalanceSheetPage() {
  const router = useRouter();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [asOfDate, setAsOfDate] = useState(todayISO());

  const { balanceSheet, isLoading, error } = useBalanceSheet(selectedBranchId, asOfDate);


  return (
    <PageAccessGuard requires="acc_balance_sheet:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Balance Sheet"
        description="Assets, liabilities, and equity as of a date."
        actions={
          <div className="flex items-center gap-3">
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40" aria-label="As of date" />
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load balance sheet</span>
        </Alert>
      )}

      {isLoading || !balanceSheet ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Badge variant={balanceSheet.isBalanced ? 'outline' : 'destructive'}>
              {balanceSheet.isBalanced ? 'Balanced (Assets = Liabilities + Equity)' : 'Out of balance'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="Assets" rows={balanceSheet.assets} total={balanceSheet.totalAssets} />
            <div className="space-y-6">
              <Section title="Liabilities" rows={balanceSheet.liabilities} total={balanceSheet.totalLiabilities} />
              <Section title="Equity" rows={balanceSheet.equity} total={balanceSheet.totalEquity} />
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Income (included in Equity)</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{balanceSheet.netIncome.toFixed(2)}</CardContent>
          </Card>
        </div>
      )}
    </PageAccessGuard>
  );
}
