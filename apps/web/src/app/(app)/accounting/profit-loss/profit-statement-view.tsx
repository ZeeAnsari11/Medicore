'use client';

import { useState } from 'react';
import { AlertCircle, Printer } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@medicore/ui';
import { useManufacturers } from '@/hooks/use-manufacturers';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { profitStatementQuery, useProfitStatement } from '@/hooks/use-ledger-reports';

const ALL = '__all__';

/** 1,234.50; negatives in brackets like the printed statement. */
const money = (n: number) => {
  const text = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < -0.004 ? `(${text})` : text;
};

function Line({ label, amount, bold, sub, indent }: { label: string; amount?: number; bold?: boolean; sub?: boolean; indent?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_9rem_9rem] gap-2 py-1 text-sm ${bold ? 'font-semibold' : ''} ${indent ? 'pl-6' : ''}`}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{sub && amount !== undefined ? money(amount) : ''}</span>
      <span className="text-right tabular-nums">{!sub && amount !== undefined ? money(amount) : ''}</span>
    </div>
  );
}

/** The margin-wise Profit & Loss Statement: stock-based cost of goods, with its filters and a PDF printout. */
export function ProfitStatementView({ branchId, from, to }: { branchId: string | null; from: string; to: string }) {
  const [manufacturerId, setManufacturerId] = useState<string>(ALL);
  const [excludeReturns, setExcludeReturns] = useState(false);
  const { manufacturers } = useManufacturers();
  const { openPdf, isOpening } = useDocumentPdf();

  const params = { branchId, from, to, manufacturerId: manufacturerId === ALL ? undefined : manufacturerId, excludeReturns };
  const { statement: s, isLoading, error } = useProfitStatement(params, from <= to);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-6 pt-6">
          <div className="min-w-64 space-y-1">
            <Label className="text-xs text-muted-foreground">Company</Label>
            <Select value={manufacturerId} onValueChange={setManufacturerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All companies</SelectItem>
                {manufacturers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={excludeReturns} onCheckedChange={(v) => setExcludeReturns(v === true)} />
            Exclude sale return from net sales
          </label>
          <Button className="ml-auto" disabled={isOpening || from > to} onClick={() => void openPdf(`/reports/profit-statement/pdf?${profitStatementQuery(params)}`)}>
            <Printer className="mr-2 h-4 w-4" />
            Print / PDF
          </Button>
        </CardContent>
      </Card>

      {(error || from > to) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{from > to ? '"From" must be on or before "To"' : 'Failed to load the profit & loss statement'}</span>
        </Alert>
      )}

      {isLoading || !s ? (
        from <= to && (
          <div className="flex h-96 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        )
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-xs text-muted-foreground">
              Net Sales does not include sales tax. Stock is valued at batch purchase price; cost of goods sold = opening stock + purchases - closing stock.
              {s.manufacturerName ? ` Limited to ${s.manufacturerName}; expenses are not filtered by company.` : ''}
            </p>
            <Line label="Net Sales Gross" amount={s.grossSales} bold />
            <Line label="Discount 1 Amount" amount={s.discount} indent />
            <Line label="Discount 2 Amount" amount={0} indent />
            <Line label="Discount 3 Amount" amount={0} indent />
            <Line label="SalesTax Amount" amount={s.salesTax} indent />
            {!s.excludeReturns && <Line label="Sale Returns" amount={s.returns} indent />}
            <Line label="Net Sales (A)" amount={s.netSales} bold />
            <div className="my-2 border-t" />
            <Line label="Opening Stock (B)" amount={s.openingStock} sub indent />
            <Line label="Stock Purchases (C)" amount={s.purchases} sub indent />
            <Line label="Total Stock B+C (D)" amount={s.totalStock} sub bold indent />
            <Line label="Closing Stock (E)" amount={s.closingStock} sub indent />
            <Line label="Total Cost Of Goods Sold D-E (F)" amount={s.cogs} bold indent />
            <div className="my-2 border-t" />
            <Line label="Gross Profit A-F (G)" amount={s.grossProfit} bold />
            <Line label="Expenses" bold />
            {s.expenses.map((e) => (
              <Line key={e.name} label={e.name} amount={e.amount} sub indent />
            ))}
            <Line label="Total Expenses (H)" amount={s.totalExpenses} bold />
            <div className="my-2 border-t" />
            <Line label="Total Claim Value (ZZ)" amount={0} bold />
            <Line label="Total Other Income (CC)" amount={0} bold />
            <Line label="Claimable Discounts" amount={0} bold />
            <Line label="Net Profit Before Tax G-H (I)" amount={s.netProfit} bold />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
