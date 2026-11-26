'use client';

import { StatCards } from '@/components/layout/stat-cards';
import { usePermissions } from '@/hooks/use-permissions';
import { useMemo } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import {
  Bar,
  BarChart,
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
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type ColumnDef,
} from '@medicore/ui';
import { useInventoryReport } from '@/hooks/use-reports';
import { exportToCsv } from '@/lib/export-csv';
import type { InventoryRollup } from '@medicore/shared-types';

const PIE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

interface InventoryReportSectionProps {
  branchId: string | null;
  startDate: string;
  endDate: string;
}

/** Stock value, category breakdown and movement trend; refetched whenever the dashboard's live stream reports stock changes. */
export function InventoryReportSection({ branchId, startDate, endDate }: InventoryReportSectionProps) {
  const { has } = usePermissions();
  const { report, isLoading, error } = useInventoryReport(branchId, undefined, startDate, endDate);

  const columns = useMemo<ColumnDef<InventoryRollup>[]>(
    () => [
      { accessorKey: 'productName', header: 'Product' },
      { accessorKey: 'unit', header: 'Unit' },
      { accessorKey: 'totalQuantity', header: 'Stock' },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.totalQuantity === 0 ? (
            <Badge variant="destructive">Out of stock</Badge>
          ) : row.original.isLowStock ? (
            <Badge variant="warning">Low stock</Badge>
          ) : (
            <Badge variant="default">In stock</Badge>
          ),
      },
      {
        accessorKey: 'nearestExpiryDate',
        header: 'Nearest expiry',
        cell: ({ getValue }) => {
          const value = getValue() as string | undefined;
          return value ? new Date(value).toLocaleDateString() : '—';
        },
      },
    ],
    [],
  );

  const handleExport = () => {
    if (!report) return;
    exportToCsv(
      'inventory-report.csv',
      report.items.map((i) => ({
        Product: i.productName,
        Unit: i.unit,
        Stock: i.totalQuantity,
        'Low stock': i.isLowStock ? 'Yes' : 'No',
        'Nearest expiry': i.nearestExpiryDate ?? '',
      })),
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Inventory</h2>
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
          <span>Failed to load inventory report</span>
        </Alert>
      )}

      {isLoading || !report ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <StatCards
            className="mb-0"
            items={[
              { title: 'Total Cost Value', value: report.summary.totalCostValue },
              { title: 'Total Retail Value', value: report.summary.totalRetailValue },
              { title: 'Low Stock Items', value: report.summary.lowStockCount, count: true },
              { title: 'Out of Stock', value: report.summary.outOfStockCount, count: true },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock Movement</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {report.movementTrend.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No movement in this range</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.movementTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="purchaseIn" name="Purchased in" fill="#16a34a" />
                      <Bar dataKey="saleOut" name="Sold out" fill="#2563eb" />
                      <Bar dataKey="adjustment" name="Adjustments" fill="#d97706" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock by Category</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {report.categoryBreakdown.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No stock on hand</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.categoryBreakdown} dataKey="totalQuantity" nameKey="categoryName" outerRadius={90} label>
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
            <h3 className="text-sm font-medium">Inventory</h3>
            {report.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products found</p>
            ) : (
              <DataTable columns={columns} data={report.items} searchPlaceholder="Search inventory..." />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
