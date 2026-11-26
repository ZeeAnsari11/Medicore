'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { DateRangeFilter, StatCards } from '@/components/layout/stat-cards';
import { ReportButton } from '@/components/layout/report-button';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useCashFlow } from '@/hooks/use-ledger-reports';

const money = (n: number) => n.toFixed(2);

export default function CashFlowPage() {
  const branchFilter = useBranchFilter();
  const [range, setRange] = useState({ from: '', to: '' });
  const { cashFlow, isLoading, error } = useCashFlow(branchFilter.branchId, range.from || undefined, range.to || undefined);
  const dated = !!(range.from || range.to);

  const flatRows = (cashFlow?.sections ?? []).flatMap((s) => s.rows);
  const receipts = flatRows.filter((r) => r.inflow > 0).sort((x, y) => y.inflow - x.inflow);
  const payments = flatRows.filter((r) => r.outflow > 0).sort((x, y) => y.outflow - x.outflow);
  const reportRows = [
    ...receipts.map((r) => ({ Type: 'Receipts', Activity: r.label, Amount: money(r.inflow) })),
    ...payments.map((r) => ({ Type: 'Payments', Activity: r.label, Amount: money(r.outflow) })),
  ];

  return (
    <PageAccessGuard requires="acc_cash_flow:read">
      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        report={
          <ReportButton
            title="Cash Flow"
            subtitle={dated ? `${range.from || 'start'} to ${range.to || 'today'}` : 'All dates'}
            summary={
              cashFlow
                ? [
                    ['Opening cash', money(cashFlow.openingCash)],
                    ['Cash in', money(cashFlow.totalInflow)],
                    ['Cash out', money(cashFlow.totalOutflow)],
                    ['Closing cash', money(cashFlow.closingCash)],
                  ]
                : undefined
            }
                        rows={reportRows}
          />
        }
        title="Cash Flow"
        description="Cash and bank money in and out, grouped by what moved it."
      />

      <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load the cash flow</span>
        </Alert>
      )}

      {isLoading || !cashFlow ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <>
          <StatCards
            items={[
              { title: 'Opening cash', value: cashFlow.openingCash, hint: dated && range.from ? `Before ${range.from}` : 'Start' },
              { title: 'Cash in', value: cashFlow.totalInflow },
              { title: 'Cash out', value: cashFlow.totalOutflow },
              { title: 'Closing cash', value: cashFlow.closingCash, hint: range.to ? `End of ${range.to}` : 'Today' },
            ]}
            note="Cash and Bank accounts together. Voided entries are reversed, not hidden."
          />

          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { key: 'receipts', title: 'Receipts', rows: receipts, pick: (r: (typeof flatRows)[number]) => r.inflow, total: cashFlow.totalInflow },
              { key: 'payments', title: 'Payments', rows: payments, pick: (r: (typeof flatRows)[number]) => r.outflow, total: cashFlow.totalOutflow },
            ].map((c) => (
              <Card key={c.key}>
                <CardHeader>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activity</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-muted-foreground">
                            Nothing in this period.
                          </TableCell>
                        </TableRow>
                      )}
                      {c.rows.map((r) => (
                        <TableRow key={r.sourceType}>
                          <TableCell>{r.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(c.pick(r))}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-bold">Total {c.title.toLowerCase()}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{money(c.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </PageAccessGuard>
  );
}
