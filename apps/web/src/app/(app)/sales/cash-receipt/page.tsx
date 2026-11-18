'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Printer, Trash2 } from 'lucide-react';
import { PaymentMethod } from '@medicore/shared-types';
import { TopbarContent } from '@/components/layout/topbar-slot';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@medicore/ui';
import { ApiError } from '@/lib/api-client';
import { OpenFromUrl } from '@/components/open-from-url';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { BranchFilter } from '@/components/branch-filter';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import {
  normalizeTransactionNumber,
  rowErrorsOf,
  useInvoiceLookup,
  useCashTransactionsPage,
  useLoadCashTransaction,
  useSaveCashReceipt,
  useUpdateCashTransaction,
  type CashReceiptResult,
  type CashTransaction,
  type LookupInvoice,
} from '@/hooks/use-cash-receipts';

const METHOD = PaymentMethod.CASH;
/** The Transaction # box always starts with this, so only the digits need typing. */
const TX_PREFIX = 'T-';

interface SheetRow {
  key: string;
  /** Set for an entry loaded from a saved transaction; absent for a row added in this session. */
  entryId?: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  /** Customer balance as looked up when the first row of that customer was added. */
  customerBalance: number;
  saleDate: string;
  voucherAmount: number;
  received: number;
  balance: number;
  amount: string;
  error?: string;
}

/** A transaction being edited: its number and the version the edit was loaded at. */
interface Editing {
  number: string;
  version: number;
  voucherNumber: string;
}

const VOIDED = 'Its payment was voided elsewhere; remove this entry';

const rowsOfTransaction = (tx: CashTransaction): SheetRow[] =>
  tx.rows.map((r) => ({
    key: r.entryId,
    entryId: r.entryId,
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    customerId: r.customerId,
    customerName: r.customerName,
    customerBalance: r.customerBalance,
    saleDate: r.saleDate,
    voucherAmount: r.voucherAmount,
    received: r.received,
    // The most this entry can be set to: what is still owed plus its own amount.
    balance: r.balance,
    amount: String(r.amount),
    error: r.paymentVoided ? VOIDED : undefined,
  }));

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function amountError(raw: string, balance: number): string | undefined {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n) || n <= 0) return 'Enter an amount greater than 0';
  if (round2(n) !== n && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'Max 2 decimals';
  if (n > balance + 0.005) return `Cannot exceed the balance of ${money(balance)}`;
  return undefined;
}

export default function CashReceiptPage() {
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const { openPdf } = useDocumentPdf();
  const branchFilter = useBranchFilter();

  const { branchId, setBranchId } = branchFilter;
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<CashReceiptResult | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [transactionInput, setTransactionInput] = useState(TX_PREFIX);
  const [txOpen, setTxOpen] = useState(false);
  const [txQuery, setTxQuery] = useState('');
  const [txHighlight, setTxHighlight] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const [voucherInput, setVoucherInput] = useState('');
  const [voucherQuery, setVoucherQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<LookupInvoice | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const voucherRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const rowInputs = useRef(new Map<string, HTMLInputElement | null>());

  const storageKey = `cash-receipt-sheet:${user?.tenantId ?? ''}`;
  const save = useSaveCashReceipt();
  const loadTransaction = useLoadCashTransaction();
  const updateTransaction = useUpdateCashTransaction();
  const { data: matches = [], isFetching } = useInvoiceLookup(voucherQuery, branchId);
  // Saved transactions matching what is typed after "T-"; the latest few while nothing is typed yet.
  const { transactions: txMatches, isFetching: txFetching } = useCashTransactionsPage(
    { branchId, q: txQuery === TX_PREFIX ? undefined : txQuery || undefined, page: 1, limit: 8 },
    txOpen,
  );

  useEffect(() => {
    voucherRef.current?.focus();
  }, [branchId]);

  useEffect(() => {
    const t = setTimeout(() => setVoucherQuery(voucherInput.trim()), 300);
    return () => clearTimeout(t);
  }, [voucherInput]);

  useEffect(() => {
    setHighlight(0);
  }, [matches]);

  useEffect(() => {
    const t = setTimeout(() => setTxQuery(transactionInput.trim()), 300);
    return () => clearTimeout(t);
  }, [transactionInput]);

  useEffect(() => {
    setTxHighlight(0);
  }, [txMatches]);

  // Restore an unsaved sheet after a refresh. Storage can be unavailable, so every access is guarded.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        setRows(s.rows ?? []);
        if (s.batchId) setBatchId(s.batchId);
        if (isAdmin && s.branchId) setBranchId(s.branchId);
      }
    } catch {
      // ignore
    }
    setRestored(true);
  }, [storageKey, isAdmin, setBranchId]);

  useEffect(() => {
    if (!restored) return;
    try {
      // An edit session is never kept as a draft: it reloads from the saved transaction.
      if (rows.length === 0 || editing) window.sessionStorage.removeItem(storageKey);
      else window.sessionStorage.setItem(storageKey, JSON.stringify({ rows, batchId, branchId }));
    } catch {
      // ignore
    }
  }, [restored, rows, batchId, branchId, storageKey, editing]);

  useEffect(() => {
    if (rows.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [rows.length]);

  // Customer balance as of each row: the base balance minus the amounts entered in rows above for the same customer.
  const computed = useMemo(() => {
    const entered = new Map<string, number>();
    const base = new Map<string, number>();
    return rows.map((r) => {
      if (!base.has(r.customerId)) base.set(r.customerId, r.customerBalance);
      const before = round2(base.get(r.customerId)! - (entered.get(r.customerId) ?? 0));
      const amt = Number(r.amount) || 0;
      entered.set(r.customerId, (entered.get(r.customerId) ?? 0) + amt);
      return { custBal: before, finalBal: round2(before - amt) };
    });
  }, [rows]);

  const accountBalance = useMemo(() => {
    if (!selected) return null;
    const first = rows.find((r) => r.customerId === selected.customerId);
    const base = first ? first.customerBalance : selected.customerBalance;
    const entered = rows
      .filter((r) => r.customerId === selected.customerId)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return round2(base - entered);
  }, [selected, rows]);

  const total = round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));

  const resetForm = () => {
    setSelected(null);
    setVoucherInput('');
    setVoucherQuery('');
    setAmountInput('');
    setFormError(null);
    setOpen(false);
    voucherRef.current?.focus();
  };

  const focusRow = (key: string) => {
    setSelectedKey(key);
    requestAnimationFrame(() => rowInputs.current.get(key)?.focus());
  };

  const pick = (inv: LookupInvoice) => {
    const existing = rows.find((r) => r.invoiceId === inv.id);
    if (existing) {
      setFormError('Already in sheet');
      setOpen(false);
      focusRow(existing.key);
      return;
    }
    setSelected(inv);
    setVoucherInput(inv.invoiceNumber);
    setVoucherQuery('');
    setOpen(false);
    setFormError(null);
    // A fully paid invoice is shown for reference only; its Amount stays disabled.
    if (inv.payable) requestAnimationFrame(() => amountRef.current?.focus());
  };

  const addRow = () => {
    if (!selected) {
      setFormError('Select a voucher first');
      return;
    }
    if (!selected.payable) {
      setFormError('Already paid');
      return;
    }
    const err = amountError(amountInput, selected.balance);
    if (err) {
      setFormError(err);
      return;
    }
    const key = crypto.randomUUID();
    setRows((prev) => [
      ...prev,
      {
        key,
        invoiceId: selected.id,
        invoiceNumber: selected.invoiceNumber,
        customerId: selected.customerId,
        customerName: selected.customerName,
        customerBalance: selected.customerBalance,
        saleDate: selected.saleDate,
        voucherAmount: selected.netTotal,
        received: selected.received,
        balance: selected.balance,
        amount: amountInput,
      },
    ]);
    setSelectedKey(key);
    resetForm();
  };

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setSelectedKey(null);
    voucherRef.current?.focus();
  }, []);

  const updateRow = (key: string, patch: Partial<SheetRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r)));

  const openTransaction = (tx: CashTransaction) => {
    setRows(rowsOfTransaction(tx));
    setEditing({ number: tx.transactionNumber, version: tx.version, voucherNumber: tx.voucherNumber });
    setTransactionInput(tx.transactionNumber);
    setSelectedKey(null);
    setSaved(null);
    if (isAdmin) setBranchId(tx.branchId);
    resetForm();
  };

  const handleLoad = async (raw = transactionInput) => {
    setTxOpen(false);
    const number = normalizeTransactionNumber(raw);
    if (!number) {
      toast.error('Enter a transaction number like T-0001');
      return;
    }
    if (rows.length > 0 && !window.confirm('Discard the entries on screen and load this transaction?')) return;
    try {
      openTransaction(await loadTransaction.mutateAsync(number));
      setNotice(null);
    } catch {
      // toasted by the hook
    }
  };

  // A link from the transactions list (`?transaction=T-0001`) opens that transaction straight away.
  const handleLoadRef = useRef(handleLoad);
  handleLoadRef.current = handleLoad;
  const openFromUrl = useCallback((number: string) => {
    setTransactionInput(number);
    void handleLoadRef.current(number);
  }, []);

  const exitEditing = () => {
    setEditing(null);
    setTransactionInput(TX_PREFIX);
    setRows([]);
    setSelectedKey(null);
    setNotice(null);
    resetForm();
  };

  const handleSaveEdits = useCallback(async () => {
    if (!editing || rows.length === 0 || updateTransaction.isPending) return;
    const withErrors = rows.map((r) => ({ ...r, error: r.error === VOIDED ? VOIDED : amountError(r.amount, r.balance) }));
    if (withErrors.some((r) => r.error)) {
      setRows(withErrors);
      toast.error('Fix the highlighted rows before saving');
      return;
    }
    try {
      const tx = await updateTransaction.mutateAsync({
        number: editing.number,
        dto: {
          expectedVersion: editing.version,
          rows: rows.map((r) => ({ entryId: r.entryId, invoiceId: r.invoiceId, amount: Number(r.amount) })),
        },
      });
      openTransaction(tx);
      setNotice(`Saved edits to ${tx.transactionNumber} (version ${tx.version}), total Rs. ${money(tx.total)}`);
    } catch (error) {
      const errs = rowErrorsOf(error);
      if (errs.length) {
        setRows((prev) => prev.map((r) => ({ ...r, error: errs.find((e) => e.invoiceId === r.invoiceId)?.reason })));
        toast.error('Nothing was saved. Some rows failed validation.');
      } else if (error instanceof ApiError && error.status === 409) {
        // Someone else changed it first: show their version instead of overwriting it.
        try {
          openTransaction(await loadTransaction.mutateAsync(editing.number));
        } catch {
          // toasted by the hook
        }
      }
    }
    // openTransaction only sets state and does not change between renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, rows, updateTransaction, loadTransaction]);

  const handleSave = useCallback(async () => {
    if (editing) return handleSaveEdits();
    if (rows.length === 0 || save.isPending) return;
    const withErrors = rows.map((r) => ({ ...r, error: amountError(r.amount, r.balance) }));
    if (withErrors.some((r) => r.error)) {
      setRows(withErrors);
      toast.error('Fix the highlighted rows before saving');
      return;
    }
    if (!branchId) {
      toast.error('Select a branch first');
      return;
    }
    try {
      const result = await save.mutateAsync({
        batchId,
        date: todayIso(),
        method: METHOD,
        rows: rows.map((r) => ({ invoiceId: r.invoiceId, amount: Number(r.amount) })),
      });
      setSaved(result);
      setNotice(null);
      setRows([]);
      setSelectedKey(null);
      setBatchId(crypto.randomUUID());
      resetForm();
    } catch (error) {
      const errs = rowErrorsOf(error);
      if (errs.length) {
        setRows((prev) => prev.map((r) => ({ ...r, error: errs.find((e) => e.invoiceId === r.invoiceId)?.reason })));
        toast.error('Nothing was saved. Some rows failed validation.');
      }
    }
  }, [rows, save, branchId, batchId, editing, handleSaveEdits]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  // Keep the highlighted suggestion visible while arrowing through a long list.
  useEffect(() => {
    suggestionsRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const onTransactionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTxHighlight((h) => Math.min(h + 1, txMatches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTxHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // An exact number wins, otherwise the highlighted suggestion; with no suggestions, what was typed.
      const typed = normalizeTransactionNumber(transactionInput);
      const pick = txMatches.find((t) => t.transactionNumber === typed) ?? txMatches[txHighlight];
      if (pick) setTransactionInput(pick.transactionNumber);
      void handleLoad(pick?.transactionNumber ?? transactionInput);
    } else if (e.key === 'Escape') {
      setTxOpen(false);
    }
  };

  const onVoucherKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const exact = matches.find((m) => m.invoiceNumber === voucherInput.trim());
      const inv = exact ?? matches[highlight];
      if (inv) pick(inv);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const onAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'F2') {
      e.preventDefault();
      if (selected) setAmountInput(String(selected.balance));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addRow();
    }
  };

  const onTableKeyDown = (e: React.KeyboardEvent) => {
    const inInput = (e.target as HTMLElement).tagName === 'INPUT';
    const idx = rows.findIndex((r) => r.key === selectedKey);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.min(Math.max(idx + (e.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)];
      if (next) focusRow(next.key);
    } else if (e.key === 'Delete' && !inInput && selectedKey) {
      e.preventDefault();
      removeRow(selectedKey);
    } else if (e.key === 'Enter' && inInput) {
      e.preventDefault();
      voucherRef.current?.focus();
    }
  };

  const printPath = (suffix = '') =>
    `/sales/cash-receipts/${saved!.id}/pdf?branchId=${branchId ?? ''}${suffix}`;

  return (
    <PageAccessGuard requires="cash_receipt:read">
      <TopbarContent>
        <h1 className="text-lg font-semibold tracking-tight">Cash Receipt</h1>
        <div className="ml-4">
          <BranchFilter filter={branchFilter} allowAll={false} disabled={rows.length > 0} />
        </div>
      </TopbarContent>

      {isAdmin && !branchId && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Select a branch to enter receipts.</span>
        </Alert>
      )}

      {saved && (
        <Alert className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span>
            {saved.transactionNumber && <b>{saved.transactionNumber}: </b>}
            {saved.count} receipt{saved.count === 1 ? '' : 's'} saved, total Rs. {money(saved.total)} (
            {saved.voucherNumber})
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => openPdf(printPath())}>
              <Printer className="mr-2 h-4 w-4" />
              Voucher
            </Button>
            {saved.rows.map((r) => (
              <Button
                key={r.invoiceId}
                size="sm"
                variant="outline"
                onClick={() => openPdf(printPath(`&invoiceId=${r.invoiceId}`))}
              >
                {r.invoiceNumber}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSaved(null)}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      {notice && (
        <Alert className="mb-6 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </Alert>
      )}

      {editing && (
        <Alert className="mb-4 flex flex-wrap items-center justify-between gap-3 border-primary">
          <span>
            Editing <b>{editing.number}</b> ({editing.voucherNumber}, version {editing.version}). Changes update the saved
            payments in place.
          </span>
          <Button size="sm" variant="outline" onClick={exitEditing}>
            Exit edit
          </Button>
        </Alert>
      )}

      <div className="mb-4 rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="relative w-64">
            <label className="mb-1 block text-sm font-medium">Transaction #</label>
            <div className="flex gap-1">
              <Input
                value={transactionInput}
                placeholder="T-0001"
                className={editing ? 'border-primary ring-1 ring-primary' : undefined}
                onChange={(e) => {
                  // Keep the "T-" in front: typing just digits, or pasting "1", still reads as a T- number.
                  const v = e.target.value.toUpperCase();
                  setTransactionInput(v.startsWith(TX_PREFIX) ? v : `${TX_PREFIX}${v.replace(/^T-?/, '')}`);
                  setTxOpen(true);
                }}
                onFocus={() => setTxOpen(true)}
                onBlur={() => setTimeout(() => setTxOpen(false), 150)}
                onKeyDown={onTransactionKeyDown}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={transactionInput.trim() === TX_PREFIX || loadTransaction.isPending}
                onClick={() => void handleLoad()}
              >
                Load
              </Button>
            </div>
            {txOpen && (
              <div className="absolute z-20 mt-1 max-h-64 w-[28rem] max-w-[90vw] overflow-auto rounded-md border bg-popover shadow-md">
                {txMatches.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    {txFetching ? 'Searching...' : 'No transactions found'}
                  </div>
                ) : (
                  txMatches.map((t, i) => (
                    <button
                      type="button"
                      key={t.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTransactionInput(t.transactionNumber);
                        void handleLoad(t.transactionNumber);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                        i === txHighlight ? 'bg-accent' : ''
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{t.transactionNumber}</span>
                        <span className="ml-2 text-muted-foreground">{t.voucherNumber}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {fmtDate(t.date)} · {t.customers.join(', ')}
                        </span>
                      </span>
                      <span className="tabular-nums">{money(t.total)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative min-w-48 flex-1">
            <label className="mb-1 block text-sm font-medium">Voucher #</label>
            <Input
              ref={voucherRef}
              autoFocus
              value={voucherInput}
              disabled={isAdmin && !branchId}
              placeholder="Search invoice number"
              onChange={(e) => {
                setVoucherInput(e.target.value);
                setSelected(null);
                setFormError(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={onVoucherKeyDown}
            />
            {open && voucherQuery && !selected && (
              <div ref={suggestionsRef} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
                {matches.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    {isFetching ? 'Searching...' : 'No outstanding invoices found'}
                  </div>
                ) : (
                  matches.map((m, i) => (
                    <button
                      type="button"
                      key={m.id}
                      data-index={i}
                                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(m);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                        i === highlight ? 'bg-accent' : ''
                      } ${m.payable ? '' : 'text-muted-foreground'}`}
                    >
                      <span>
                        <span className="font-medium">{m.invoiceNumber}</span>
                        <span className="ml-2 text-muted-foreground">{m.customerName}</span>
                      </span>
                      {m.payable ? (
                        <span className="tabular-nums">{money(m.balance)}</span>
                      ) : (
                        <Badge variant="secondary">Paid</Badge>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="w-40">
            <label className="mb-1 block text-sm font-medium">Date</label>
            <Input value={selected ? fmtDate(selected.saleDate) : ''} readOnly tabIndex={-1} />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium">Amount</label>
            <div className="flex gap-1">
              <Input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amountInput}
                disabled={!selected || !selected.payable}
                placeholder={selected && !selected.payable ? 'Already paid' : undefined}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setFormError(null);
                }}
                onKeyDown={onAmountKeyDown}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selected || !selected.payable}
                tabIndex={-1}
                title="Fill full balance (F2)"
                onClick={() => selected && setAmountInput(String(selected.balance))}
              >
                Full
              </Button>
            </div>
          </div>
        </div>
        {formError && <p className="mb-2 text-sm text-destructive">{formError}</p>}

        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {[
            ['Account Balance', accountBalance],
            ['S-Invoice Amount', selected?.netTotal ?? null],
            ['S-I-Received Amount', selected?.received ?? null],
            ['Balance', selected?.balance ?? null],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="text-muted-foreground">{label}</div>
              <div className="font-semibold tabular-nums">{value === null ? '-' : money(value as number)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border" onKeyDown={onTableKeyDown}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ser #</TableHead>
              <TableHead>A/C Description</TableHead>
              <TableHead className="text-right">Cust. Bal.</TableHead>
              <TableHead>S-Invoice#</TableHead>
              <TableHead className="text-right">S-Invoice Amount</TableHead>
              <TableHead className="text-right">S-I-Received Amount</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Final Bal.</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No entries yet. Type a voucher number above, or load a transaction.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow
                key={r.key}
                data-state={r.key === selectedKey ? 'selected' : undefined}
                className={r.key === selectedKey ? 'bg-muted' : undefined}
                onClick={() => setSelectedKey(r.key)}
              >
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{r.customerName}</TableCell>
                <TableCell className="text-right tabular-nums">{money(computed[i].custBal)}</TableCell>
                <TableCell>{r.invoiceNumber}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.voucherAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.received)}</TableCell>
                <TableCell className="text-right">
                  <Input
                    ref={(el) => {
                      rowInputs.current.set(r.key, el);
                    }}
                    type="number"
                    min={0}
                    step="0.01"
                    className="ml-auto h-8 w-28 text-right"
                    value={r.amount}
                    aria-invalid={!!r.error}
                    onFocus={() => setSelectedKey(r.key)}
                    onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                  />
                  {(r.error || amountError(r.amount, r.balance)) && (
                    <div className="mt-1 text-xs text-destructive">{r.error ?? amountError(r.amount, r.balance)}</div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(computed[i].finalBal)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" aria-label="Remove row" onClick={() => removeRow(r.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <span>
            Entries: <b>{rows.length}</b>
          </span>
          <span>
            Total: <b className="tabular-nums">Rs. {money(total)}</b>
          </span>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={
            !has(editing ? 'cash_receipt:update' : 'cash_receipt:create') ||
            rows.length === 0 ||
            save.isPending ||
            updateTransaction.isPending
          }
        >
          {save.isPending || updateTransaction.isPending ? 'Saving...' : editing ? 'Save edits' : 'Save'}
        </Button>
      </div>

      <Suspense fallback={null}>
        <OpenFromUrl param="transaction" onOpen={openFromUrl} />
      </Suspense>
    </PageAccessGuard>
  );
}
