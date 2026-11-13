'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
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
import { useProfitLoss } from '@/hooks/use-ledger-reports';


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function ProfitLossPage() {
  const router = useRouter();

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());

  const { profitLoss, isLoading, error } = useProfitLoss(selectedBranchId, startDate, endDate);


  return (
    <PageAccessGuard requires="acc_profit_loss:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Profit & Loss"
        description="Revenue vs expenses for a date range."
        actions={
          <div className="flex items-center gap-3">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" aria-label="From date" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" aria-label="To date" />
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load profit & loss</span>
        </Alert>
      )}

      {isLoading || !profitLoss ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue</CardTitle>
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
                  {profitLoss.revenue.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total Revenue</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{profitLoss.totalRevenue.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expenses</CardTitle>
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
                  {profitLoss.expenses.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total Expenses</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{profitLoss.totalExpenses.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Net Income</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold tabular-nums">{profitLoss.netIncome.toFixed(2)}</CardContent>
          </Card>
        </div>
      )}
    </PageAccessGuard>
  );
}
