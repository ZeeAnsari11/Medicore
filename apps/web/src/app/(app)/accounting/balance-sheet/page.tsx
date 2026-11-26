'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { StatCards } from '@/components/layout/stat-cards';
import { ReportButton } from '@/components/layout/report-button';
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
  Button,
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

  const branchFilter = useBranchFilter();
  const selectedBranchId = branchFilter.branchId;
  const [asOfDate, setAsOfDate] = useState(todayISO());

  const { balanceSheet, isLoading, error } = useBalanceSheet(selectedBranchId, asOfDate);


  return (
    <PageAccessGuard requires="acc_balance_sheet:read">

      <PageHeader
        report={<ReportButton
          title={`Balance Sheet as of ${asOfDate}`}
          disabled={!balanceSheet}
          rows={
            balanceSheet
              ? [
                  ...balanceSheet.assets.map((r) => ({ Section: 'Assets', Account: r.accountName, Amount: r.amount.toFixed(2) })),
                  { Section: 'Assets', Account: 'Total assets', Amount: balanceSheet.totalAssets.toFixed(2) },
                  ...balanceSheet.liabilities.map((r) => ({ Section: 'Liabilities', Account: r.accountName, Amount: r.amount.toFixed(2) })),
                  { Section: 'Liabilities', Account: 'Total liabilities', Amount: balanceSheet.totalLiabilities.toFixed(2) },
                  ...balanceSheet.equity.map((r) => ({ Section: 'Equity', Account: r.accountName, Amount: r.amount.toFixed(2) })),
                  { Section: 'Equity', Account: 'Net income (included in equity)', Amount: balanceSheet.netIncome.toFixed(2) },
                  { Section: 'Equity', Account: 'Total equity', Amount: balanceSheet.totalEquity.toFixed(2) },
                ]
              : []
          }
        />}
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        title="Balance Sheet"
        description="Assets, liabilities, and equity as of a date."
        activeFilterCount={asOfDate !== todayISO() ? 1 : 0}
        filters={
          <>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40" aria-label="As of date" />
            <Button
              disabled={!(asOfDate !== todayISO())} variant="outline" size="sm" onClick={() => setAsOfDate(todayISO())}>
              Clear filters
            </Button>
          </>
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

          <StatCards className="mb-0" items={[{ title: 'Net Income (included in Equity)', value: balanceSheet.netIncome }]} />
        </div>
      )}
    </PageAccessGuard>
  );
}
