'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  Hash,
  Plus,
  Printer,
  Receipt,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
  type ColumnDef,
} from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { expenseLedgerQuery, useExpenses } from '@/hooks/use-expenses';
import { useExpenseCategories } from '@/hooks/use-expense-categories';
import type { Expense } from '@medicore/shared-types';
import { ExpenseDialog } from './components/expense-dialog';
import { OpenFromUrl } from '@/components/open-from-url';
import { ExpenseDetailDialog } from './components/expense-detail-dialog';
import { ExpenseNav } from './components/expense-nav';
import { PAYMENT_METHOD_LABEL, formatAmount } from './expense-utils';

const ALL = '__all__';

/** yyyy-mm-dd of a local calendar day. */
const dayISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function periods() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  return [
    { key: 'all', label: 'All time', from: '', to: '' },
    { key: 'month', label: 'This month', from: dayISO(monthStart), to: dayISO(now) },
    { key: '30d', label: 'Last 30 days', from: dayISO(thirtyDaysAgo), to: dayISO(now) },
  ];
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExpensesPage() {
  const router = useRouter();
  const { has } = usePermissions();
  const branchFilter = useBranchFilter();
  const branchId = branchFilter.branchId;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detail, setDetail] = useState<Expense | null>(null);
  // Opened from a link elsewhere (?open=<id>), e.g. an invoice's difference.
  const [openId, setOpenId] = useState<string | null>(null);

  const { expenses, isLoading, error } = useExpenses(branchId);
  useEffect(() => {
    const linked = openId ? expenses.find((e) => e.id === openId) : undefined;
    if (linked) {
      setDetail(linked);
      setOpenId(null);
    }
  }, [openId, expenses]);
  const { categories } = useExpenseCategories(branchId);
  const { openPdf, isOpening } = useDocumentPdf();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState(ALL);
  const [subCategoryId, setSubCategoryId] = useState(ALL);
  const [method, setMethod] = useState(ALL);

  const presets = periods();
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.key;
  const filtersActive =
    !!from || !!to || categoryId !== ALL || subCategoryId !== ALL || method !== ALL;
  const clearFilters = () => {
    setFrom('');
    setTo('');
    setCategoryId(ALL);
    setSubCategoryId(ALL);
    setMethod(ALL);
  };

  // Categories belong to a branch: when more than one is listed (All branches), say which each is from.
  const severalBranches = new Set(categories.map((c) => c.branchId)).size > 1;
  const subOptions = categories.find((c) => c.id === categoryId)?.subCategories ?? [];

  const filtered = useMemo(
    () =>
      expenses.filter((e) => {
        const day = e.expenseDate.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (categoryId !== ALL && e.categoryId !== categoryId) return false;
        if (subCategoryId !== ALL && e.subCategoryId !== subCategoryId) return false;
        if (method !== ALL && e.paymentMethod !== method) return false;
        return true;
      }),
    [expenses, from, to, categoryId, subCategoryId, method],
  );

  const summary = useMemo(() => {
    const total = filtered.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = new Map<string, number>();
    for (const e of filtered) {
      const name = e.categoryName ?? e.expenseAccountName ?? 'Uncategorised';
      byCategory.set(name, (byCategory.get(name) ?? 0) + e.amount);
    }
    const [topName, topAmount] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    return {
      total,
      count: filtered.length,
      average: filtered.length ? total / filtered.length : 0,
      topName,
      topAmount,
    };
  }, [filtered]);

  const columns = useMemo<ColumnDef<Expense>[]>(
    () => [
      {
        // Running number per tenant (1, 2, 3 ...), like Payment ID.
        accessorKey: 'expenseNumber',
        header: 'Expense ID',
        sortingFn: (a, b) => (a.original.expenseNumber ?? 0) - (b.original.expenseNumber ?? 0),
        cell: ({ getValue }) => <span className="tabular-nums">{(getValue() as number | undefined) ?? '—'}</span>,
      },
      {
        accessorKey: 'expenseDate',
        header: 'Date',
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap">
            {new Date(getValue() as string).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'category',
        header: 'Exp Category',
        accessorFn: (e) =>
          [e.categoryName ?? e.expenseAccountName, e.subCategoryName].filter(Boolean).join(' '),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {row.original.categoryName ?? row.original.expenseAccountName ?? '—'}
            </Badge>
            {row.original.subCategoryName && (
              <span className="text-xs text-muted-foreground">
                › {row.original.subCategoryName}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <div className="min-w-40">
            <p>{row.original.description}</p>
            {row.original.reference && (
              <p className="text-xs text-muted-foreground">Ref: {row.original.reference}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'paymentMethod',
        header: 'Paid',
        cell: ({ row }) => (
          <div>
            <Badge variant="secondary">
              {row.original.source === 'CASH_RECEIPT'
                ? `Written off${row.original.invoiceNumber ? ` · ${row.original.invoiceNumber}` : ''}`
                : row.original.paymentMethod
                  ? (PAYMENT_METHOD_LABEL[row.original.paymentMethod] ?? row.original.paymentMethod)
                  : '—'}
            </Badge>
            {row.original.paymentAccountName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.original.paymentAccountName}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'amount',
        header: () => <div className="text-right">Amount</div>,
        cell: ({ getValue }) => (
          <div className="text-right font-semibold tabular-nums">
            {formatAmount(getValue() as number)}
          </div>
        ),
      },
    ],
    [],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={categoryId}
        onValueChange={(v) => {
          setCategoryId(v);
          setSubCategoryId(ALL);
        }}
      >
        <SelectTrigger className="w-44" aria-label="Filter by Exp category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Exp categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {severalBranches && c.branchName ? ` · ${c.branchName}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={subCategoryId}
        onValueChange={setSubCategoryId}
        disabled={subOptions.length === 0}
      >
        <SelectTrigger className="w-44" aria-label="Filter by Exp sub category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Exp sub categories</SelectItem>
          {subOptions.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={method} onValueChange={setMethod}>
        <SelectTrigger className="w-40" aria-label="Filter by payment method">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All methods</SelectItem>
          {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* The sheet follows the filters above (the text search is not included). */}
      <Button
        type="button"
        variant="outline"
        disabled={isOpening || filtered.length === 0}
        onClick={() =>
          void openPdf(
            `/accounting/expenses/pdf?${expenseLedgerQuery({
              branchId,
              from,
              to,
              categoryId: categoryId === ALL ? undefined : categoryId,
              subCategoryId: subCategoryId === ALL ? undefined : subCategoryId,
              paymentMethod: method === ALL ? undefined : method,
            })}`,
          )
        }
      >
        <Printer className="mr-2 h-4 w-4" />
        Expense Sheet
      </Button>
    </div>
  );

  return (
    <PageAccessGuard requires="acc_expenses:read">
      <button
        onClick={() => router.push('/accounting')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Accounting
      </button>

      <PageHeader
        title="Expenses"
        description="Everything you spend, by category and sub-category."
        actions={
          <Button disabled={!has('acc_expenses:create')} onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record Expense
          </Button>
        }
      />

      <ExpenseNav />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load expenses</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading expenses">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Record rent, utility bills, salaries and other spending. Organise them with categories and sub-categories."
          action={
            has('acc_expenses:create') && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Record your first expense
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon={Wallet}
              label="Total spent"
              value={formatAmount(summary.total)}
              hint={filtersActive ? 'Matching your filters' : 'All expenses'}
            />
            <Stat icon={Hash} label="Expenses" value={String(summary.count)} />
            <Stat
              icon={Calculator}
              label="Average"
              value={formatAmount(summary.average)}
              hint="Per expense"
            />
            <Stat
              icon={Receipt}
              label="Top category"
              value={summary.topName ?? '—'}
              hint={summary.topAmount !== undefined ? formatAmount(summary.topAmount) : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
                aria-pressed={activePreset === p.key}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  activePreset === p.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Input
                type="date"
                aria-label="From date"
                className="w-40"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                className="w-40"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filtered}
            searchPlaceholder="Search expenses..."
            emptyMessage="No expenses match these filters."
            toolbar={toolbar}
            onRowClick={(row) => setDetail(row)}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
          />
        </div>
      )}

      <Suspense fallback={null}>
        <OpenFromUrl onOpen={setOpenId} />
      </Suspense>
      <ExpenseDetailDialog expense={detail} onOpenChange={(open) => !open && setDetail(null)} />

      <ExpenseDialog open={dialogOpen} branchId={branchId} onOpenChange={setDialogOpen} />
    </PageAccessGuard>
  );
}
