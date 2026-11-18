'use client';

import { useState } from 'react';
import { AlertCircle, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { useOrderBookers, useSalesPage } from '@/hooks/use-sales';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { usePermissions } from '@/hooks/use-permissions';
import { PaymentStatus } from '@medicore/shared-types';

const ALL = '__all__';
// The API caps a page at 500 rows.
const REPORT_LIMIT = 500;

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrderBookerReportPage() {
  const { has } = usePermissions();
  const canSeeAll = has('sales:view_all');
  const branchFilter = useBranchFilter();
  const branchId = branchFilter.branchId;

  const [orderBookerId, setOrderBookerId] = useState(ALL);
  const [paymentStatus, setPaymentStatus] = useState(ALL);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { orderBookers } = useOrderBookers(branchId, canSeeAll);
  const { sales, total, isLoading, error } = useSalesPage({
    branchId,
    orderBookerId: orderBookerId === ALL ? undefined : orderBookerId,
    paymentStatus: paymentStatus === ALL ? undefined : paymentStatus,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page: 1,
    limit: REPORT_LIMIT,
  });

  const bookerName =
    orderBookerId === ALL ? (canSeeAll ? 'All order bookers' : (sales[0]?.orderBookerName ?? 'My orders')) : (orderBookers.find((o) => o.id === orderBookerId)?.name ?? '');
  const period = startDate || endDate ? `${startDate || 'Start'} to ${endDate || 'Today'}` : 'All dates';

  const totals = sales.reduce(
    (t, s) => ({
      gross: t.gross + s.grandTotal,
      returned: t.returned + (s.returnedTotal ?? 0),
      net: t.net + (s.netTotal ?? s.grandTotal),
      paid: t.paid + s.amountPaid,
    }),
    { gross: 0, returned: 0, net: 0, paid: 0 },
  );

  return (
    <PageAccessGuard requires="sales:read">
      <PageHeader
        title="Order Booker Report"
        description="Orders booked by a user, with totals"
        actions={
          <Button onClick={() => window.print()} disabled={sales.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save PDF
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load the report</span>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canSeeAll && (
          <Select value={orderBookerId} onValueChange={setOrderBookerId}>
            <SelectTrigger className="w-52" aria-label="Order Booker">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Order Bookers</SelectItem>
              {orderBookers.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
          <SelectTrigger className="w-40" aria-label="Payment status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All payments</SelectItem>
            {Object.values(PaymentStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          From
          <Input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          To
          <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </label>
        <Button
        disabled={!((orderBookerId !== ALL || paymentStatus !== ALL || startDate || endDate))}
          variant="outline"
          size="sm"
          onClick={() => {
            setOrderBookerId(ALL);
            setPaymentStatus(ALL);
            setStartDate('');
            setEndDate('');
          }}
        >
          Clear filters
        </Button>
      </div>

      <div data-print-area="true" className="rounded-lg border bg-background p-6 print:border-0 print:p-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b pb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Order Booker Report</h2>
            <p className="text-sm text-muted-foreground">{bookerName}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Period: {period}</p>
            <p>Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Orders', String(total)],
            ['Total', money(totals.gross)],
            ['Returned', money(totals.returned)],
            ['Net', money(totals.net)],
            ['Paid', money(totals.paid)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : sales.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No orders for these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Invoice / Order</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Customer</th>
                {orderBookerId === ALL && canSeeAll && <th className="py-2 pr-3">Order Booker</th>}
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Returned</th>
                <th className="py-2 pr-3 text-right">Net</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => (
                <tr key={s.id} className="border-b last:border-0 print:break-inside-avoid">
                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 font-medium">{s.invoiceNumber || s.orderNumber || '—'}</td>
                  <td className="py-2 pr-3">{new Date(s.saleDate).toLocaleDateString()}</td>
                  <td className="py-2 pr-3">{s.customerName ?? 'Walk-in'}</td>
                  {orderBookerId === ALL && canSeeAll && <td className="py-2 pr-3">{s.orderBookerName ?? '—'}</td>}
                  <td className="py-2 pr-3 text-right">{money(s.grandTotal)}</td>
                  <td className="py-2 pr-3 text-right">{money(s.returnedTotal ?? 0)}</td>
                  <td className="py-2 pr-3 text-right">{money(s.netTotal ?? s.grandTotal)}</td>
                  <td className="py-2 pr-3 text-right">{money(s.amountPaid)}</td>
                  <td className="py-2">
                    <Badge variant={s.paymentStatus === PaymentStatus.PAID ? 'default' : s.paymentStatus === PaymentStatus.PARTIAL ? 'warning' : 'secondary'}>
                      {s.paymentStatus}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > REPORT_LIMIT && (
          <p className="mt-4 text-xs text-muted-foreground">
            Showing the first {REPORT_LIMIT} of {total} orders. Narrow the date range to see the rest.
          </p>
        )}
      </div>
    </PageAccessGuard>
  );
}
