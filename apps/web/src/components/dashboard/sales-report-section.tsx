'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type ColumnDef,
} from '@medicore/ui';
import { useSalesReport } from '@/hooks/use-reports';
import { exportToCsv } from '@/lib/export-csv';
import type { SalesReportTopProduct } from '@medicore/shared-types';

const PIE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

interface SalesReportSectionProps {
  branchId: string | null;
  startDate: string;
  endDate: string;
}

/** Revenue, top products and category breakdown; refetched whenever the dashboard's live stream reports a sale. */
export function SalesReportSection({ branchId, startDate, endDate }: SalesReportSectionProps) {
  const { has } = usePermissions();
  const { report, isLoading, error } = useSalesReport(branchId, startDate, endDate);

  const columns = useMemo<ColumnDef<SalesReportTopProduct>[]>(
    () => [
      { accessorKey: 'productName', header: 'Product' },
      { accessorKey: 'quantity', header: 'Units sold' },
      {
        accessorKey: 'revenue',
        header: 'Revenue',
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
      },
    ],
    [],
  );

  const handleExport = () => {
    if (!report) return;
    exportToCsv(
      `sales-report-${startDate}-to-${endDate}.csv`,
      report.topProducts.map((p) => ({
        Product: p.productName,
        'Units sold': p.quantity,
        Revenue: p.revenue.toFixed(2),
      })),
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sales</h2>
        {has('reports:export') && (
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!report}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load sales report</span>
        </Alert>
      )}

      {isLoading || !report ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{report.summary.totalRevenue.toFixed(2)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Transactions</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{report.summary.totalTransactions}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Order Value</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{report.summary.averageOrderValue.toFixed(2)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Tax Collected</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">{report.summary.totalTaxCollected.toFixed(2)}</CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {report.revenueTrend.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No sales in this range</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.revenueTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {report.categoryBreakdown.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No sales in this range</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.categoryBreakdown} dataKey="revenue" nameKey="categoryName" outerRadius={90} label>
                        {report.categoryBreakdown.map((entry, index) => (
                          <Cell key={entry.categoryName} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Top Products</h3>
            {report.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this range</p>
            ) : (
              <DataTable columns={columns} data={report.topProducts} searchPlaceholder="Search products..." />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
