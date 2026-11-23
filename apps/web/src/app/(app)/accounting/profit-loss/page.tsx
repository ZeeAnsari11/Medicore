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
  Button,
} from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import type { ProfitGroupBy } from '@medicore/shared-types';
import { useProfitBreakdown, useProfitLoss } from '@/hooks/use-ledger-reports';
import { ProfitStatementView } from './profit-statement-view';


const GROUPS: Array<{ value: ProfitGroupBy; label: string; column: string }> = [
  { value: 'customer', label: 'Customer', column: 'Customer' },
  { value: 'vendor', label: 'Vendor', column: 'Vendor' },
  { value: 'manufacturer', label: 'Manufacturer', column: 'Manufacturer' },
  { value: 'orderBooker', label: 'Order booker', column: 'Order booker' },
  { value: 'city', label: 'City', column: 'City' },
  { value: 'territory', label: 'Territory', column: 'Territory' },
  { value: 'product', label: 'Product', column: 'Product' },
];

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

  // null = the normal statement; otherwise gross profit grouped by that one dimension.
  const [groupBy, setGroupBy] = useState<ProfitGroupBy | null>(null);
  // The stock-based, margin-wise statement laid out like the printed P&L.
  const [marginView, setMarginView] = useState(false);

  const { profitLoss, isLoading, error } = useProfitLoss(selectedBranchId, startDate, endDate);
  const {
    breakdown,
    isLoading: breakdownLoading,
    error: breakdownError,
  } = useProfitBreakdown(selectedBranchId, groupBy, startDate, endDate);
  const group = GROUPS.find((g) => g.value === groupBy);


  return (
    <PageAccessGuard requires="acc_profit_loss:read">
      <button onClick={() => router.push('/accounting')} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Profit & Loss"
        description="Revenue vs expenses, or gross profit by customer, vendor, manufacturer, order booker, city, territory or product, for a date range."
        actions={
          <div className="flex items-center gap-3">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" aria-label="From date" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" aria-label="To date" />
            <Button
              disabled={!((startDate !== daysAgoISO(30) || endDate !== todayISO()))}
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate(daysAgoISO(30));
                setEndDate(todayISO());
              }}
            >
              Clear filters
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={groupBy === null && !marginView ? 'default' : 'outline'}
          onClick={() => {
            setGroupBy(null);
            setMarginView(false);
          }}
        >
          Statement
        </Button>
        <Button
          size="sm"
          variant={marginView ? 'default' : 'outline'}
          onClick={() => {
            setGroupBy(null);
            setMarginView(true);
          }}
        >
          Margin statement
        </Button>
        {GROUPS.map((g) => (
          <Button key={g.value} size="sm" variant={groupBy === g.value ? 'default' : 'outline'} onClick={() => {
              setGroupBy(g.value);
              setMarginView(false);
            }}
          >
            By {g.label.toLowerCase()}
          </Button>
        ))}
      </div>

      {marginView ? (
        <ProfitStatementView branchId={selectedBranchId} from={startDate} to={endDate} />
      ) : groupBy !== null && group ? (
        <>
          {breakdownError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <span>Failed to load the profit breakdown</span>
            </Alert>
          )}
          {breakdownLoading || !breakdown ? (
            <div className="flex h-96 items-center justify-center">
              <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gross profit by {group.label.toLowerCase()}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Gross profit = net sales after returns, excluding tax, less the purchase cost of what was sold. Profit / unit = gross profit per unit sold. Highest profit first.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>{group.column}</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Net sales</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Gross profit</TableHead>
                      <TableHead className="text-right">Profit / unit</TableHead>
                      <TableHead className="text-right">Share %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdown.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No sales in this period.
                        </TableCell>
                      </TableRow>
                    )}
                    {breakdown.rows.map((row, i) => (
                      <TableRow key={row.key}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.invoices}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.netUnits}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.netSales.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.cogs.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.grossProfit.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.profitPerUnit === null ? '—' : row.profitPerUnit.toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.profitSharePct === null ? '—' : row.profitSharePct.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell />
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{breakdown.totals.invoices}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{breakdown.totals.netUnits}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{breakdown.totals.netSales.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{breakdown.totals.cogs.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{breakdown.totals.grossProfit.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{breakdown.totals.profitPerUnit === null ? '—' : breakdown.totals.profitPerUnit.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </PageAccessGuard>
  );
}
