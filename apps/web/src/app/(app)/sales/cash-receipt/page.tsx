'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Printer, Trash2 } from 'lucide-react';
import { PaymentMethod } from '@medicore/shared-types';
import { TopbarContent } from '@/components/layout/topbar-slot';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ComboboxWithCreate,
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
  usePartyInvoices,
  useOutstandingParties,
  useCashTransactionsPage,
  useLastCashTransaction,
  useLoadCashTransaction,
  useSaveCashReceipt,
  useUpdateCashTransaction,
  type CashReceiptResult,
  type CashTransaction,
  RECEIPT_KIND,
  type LookupInvoice,
  type ReceiptKind,
} from '@/hooks/use-cash-receipts';

const METHOD = PaymentMethod.CASH;

/** Wording and permissions of the two kinds of sheet: customers' cash receipts and vendors' bulk purchase receipts. */
const KIND_TEXT = {
  sale: {
    title: 'Cash Receipt',
    party: 'Customer',
    invoiceCol: 'S-Invoice',
    settledCol: 'S-I-Received',
    saved: 'receipt',
    branchHint: 'Select a branch to enter receipts.',
  },
  purchase: {
    title: 'Bulk Purchase Receipt',
    party: 'Vendor',
    invoiceCol: 'P-Invoice',
    settledCol: 'P-I-Paid',
    saved: 'payment',
    branchHint: 'Select a branch to enter payments.',
  },
} as const;

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
  /** Written off so the invoice is settled; booked to the branch's Difference > Sales Difference. */
  difference: string;
  /** The invoice is fully paid, so this saved entry is final: it can be removed but no longer edited. */
  locked?: boolean;
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
    difference: r.difference ? String(r.difference) : '',
    locked: !!r.invoicePaid,
    error: r.paymentVoided ? VOIDED : undefined,
  }));

/** A sheet row for an invoice from the lookup; amount and difference are typed by the user (blank until then). */
const rowOfInvoice = (inv: LookupInvoice, amount = '', difference = ''): SheetRow => ({
  key: crypto.randomUUID(),
  invoiceId: inv.id,
  invoiceNumber: inv.invoiceNumber,
  customerId: inv.customerId,
  customerName: inv.customerName,
  customerBalance: inv.customerBalance,
  saleDate: inv.saleDate,
  voucherAmount: inv.netTotal,
  received: inv.received,
  balance: inv.balance,
  amount,
  difference,
});

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function amountError(raw: string, balance: number, differenceRaw = ''): string | undefined {
  const n = Number(raw);
  if (raw.trim() === '' || Number.isNaN(n) || n <= 0) return 'Enter an amount greater than 0';
  if (round2(n) !== n && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'Max 2 decimals';
  const d = differenceRaw.trim() === '' ? 0 : Number(differenceRaw);
  if (Number.isNaN(d) || d < 0) return 'Difference must be 0 or more';
  if (round2(d) !== d && Math.abs(d * 100 - Math.round(d * 100)) > 1e-6) return 'Max 2 decimals';
  if (n + d > balance + 0.005)
    return d > 0 ? `Amount plus difference cannot exceed the balance of ${money(balance)}` : `Cannot exceed the balance of ${money(balance)}`;
  return undefined;
}

const num = (raw: string) => Number(raw) || 0;

export default function CashReceiptPage() {
  const { user } = useAuth();
  const { isAdmin, has } = usePermissions();
  const { openPdf } = useDocumentPdf();
  const branchFilter = useBranchFilter();

  const { branchId, setBranchId } = branchFilter;
  // Which sheet is open; it can only be switched while the sheet is empty.
  const [kind, setKind] = useState<ReceiptKind>('sale');
  const txPrefix = RECEIPT_KIND[kind].prefix;
  const text = KIND_TEXT[kind];
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState<CashReceiptResult | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [transactionInput, setTransactionInput] = useState<string>(RECEIPT_KIND.sale.prefix);
  const [txOpen, setTxOpen] = useState(false);
  const [txQuery, setTxQuery] = useState('');
  const [txHighlight, setTxHighlight] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Opened from the ledger (`readonly=1`): nothing on the page can be changed, and one entry is highlighted.
  const [readOnly, setReadOnly] = useState(false);
  const [highlightInvoiceId, setHighlightInvoiceId] = useState<string | null>(null);
  const router = useRouter();

  // How invoices are found: by typing a voucher number, or by picking the customer / vendor and ticking invoices.
  const [findBy, setFindBy] = useState<'voucher' | 'party'>('voucher');
  // The chosen customer / vendor only counts for the kind and branch it was picked under.
  const [party, setParty] = useState({ scope: '', id: '' });
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherQuery, setVoucherQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<LookupInvoice | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [differenceInput, setDifferenceInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const voucherRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const rowInputs = useRef(new Map<string, HTMLInputElement | null>());

  const storageKey = `cash-receipt-sheet:${user?.tenantId ?? ''}`;
  const save = useSaveCashReceipt(kind);
  const loadTransaction = useLoadCashTransaction(kind);
  const updateTransaction = useUpdateCashTransaction(kind);
  const { data: matches = [], isFetching } = useInvoiceLookup(voucherQuery, branchId, kind);
  const partyScope = `${kind}:${branchId ?? ''}`;
  const partyId = party.scope === partyScope ? party.id : '';
  const { data: partyInvoices = [], isFetching: partyFetching } = usePartyInvoices(partyId, branchId, kind);
  const { data: parties = [] } = useOutstandingParties(branchId, kind, findBy === 'party');
  const partyOptions = useMemo(
    () =>
      parties.map((p) => ({
        value: p.id,
        label: p.name,
        hint: `${p.openInvoices} ${p.openInvoices === 1 ? 'invoice' : 'invoices'} · ${money(p.due)}`,
      })),
    [parties],
  );
  const lastTransaction = useLastCashTransaction(branchId, kind);
  const lastNumber = lastTransaction?.transactionNumber ?? null;
  // Saved transactions matching what is typed after "T-"; the latest few while nothing is typed yet.
  const { transactions: txMatches, isFetching: txFetching } = useCashTransactionsPage(
    { branchId, q: txQuery === txPrefix ? undefined : txQuery || undefined, page: 1, limit: 8 },
    txOpen,
    kind,
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

  // My last created or edited transaction goes into the box, ready to Load. It never overwrites something typed or loaded.
  useEffect(() => {
    if (lastNumber) setTransactionInput((current) => (current === txPrefix && !editing ? lastNumber : current));
    // Only when the last number itself changes, so clearing the box by hand sticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNumber]);

  // Restore an unsaved sheet after a refresh. Storage can be unavailable, so every access is guarded.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.kind === 'purchase') {
          setKind('purchase');
          setTransactionInput(RECEIPT_KIND.purchase.prefix);
        }
        setRows((s.rows ?? []).map((r: SheetRow) => ({ ...r, difference: r.difference ?? '' })));
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
      else window.sessionStorage.setItem(storageKey, JSON.stringify({ rows, batchId, branchId, kind }));
    } catch {
      // ignore
    }
  }, [restored, rows, batchId, branchId, storageKey, editing, kind]);

  // Only an unsaved new sheet is worth a warning; an edit session just reloads from the saved transaction.
  useEffect(() => {
    if (rows.length === 0 || editing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [rows.length, editing]);

  // Customer balance as of each row: the base balance minus the amounts entered in rows above for the same customer.
  const computed = useMemo(() => {
    const entered = new Map<string, number>();
    const base = new Map<string, number>();
    return rows.map((r) => {
      if (!base.has(r.customerId)) base.set(r.customerId, r.customerBalance);
      const before = round2(base.get(r.customerId)! - (entered.get(r.customerId) ?? 0));
      // What the row settles: cash plus the difference written off.
      const amt = num(r.amount) + num(r.difference);
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
      .reduce((s, r) => s + num(r.amount) + num(r.difference), 0);
    return round2(base - entered);
  }, [selected, rows]);

  const total = round2(rows.reduce((s, r) => s + num(r.amount), 0));
  const differenceTotal = round2(rows.reduce((s, r) => s + num(r.difference), 0));

  const resetForm = () => {
    setSelected(null);
    setVoucherInput('');
    setVoucherQuery('');
    setAmountInput('');
    setDifferenceInput('');
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
    const err = amountError(amountInput, selected.balance, differenceInput);
    if (err) {
      setFormError(err);
      return;
    }
    const row = rowOfInvoice(selected, amountInput, differenceInput);
    setRows((prev) => [...prev, row]);
    const key = row.key;
    setSelectedKey(key);
    resetForm();
  };

  const inSheet = (invoiceId: string) => rows.some((r) => r.invoiceId === invoiceId);
  const tickable = partyInvoices.filter((inv) => inv.payable && !inSheet(inv.id));
  const tickedNow = tickable.filter((inv) => ticked.has(inv.id));
  const allTicked: boolean | 'indeterminate' =
    tickable.length > 0 && tickedNow.length === tickable.length ? true : tickedNow.length > 0 ? 'indeterminate' : false;

  const toggleTick = (id: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAllTicks = (on: boolean) => setTicked(on ? new Set(tickable.map((inv) => inv.id)) : new Set());

  // The ticked invoices become sheet rows with the amount left blank for the user to type.
  const addTicked = () => {
    if (tickedNow.length === 0) return;
    const added = tickedNow.map((inv) => rowOfInvoice(inv));
    setRows((prev) => [...prev, ...added]);
    setTicked(new Set());
    setFormError(null);
    focusRow(added[0].key);
  };

  const removeRow = useCallback((key: string) => {
    if (readOnly) return;
    setRows((prev) => prev.filter((r) => r.key !== key));
    setSelectedKey(null);
    voucherRef.current?.focus();
  }, []);

  const updateRow = (key: string, patch: Partial<SheetRow>) =>
    !readOnly &&
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r)));

  // Bring the highlighted entry into view.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightInvoiceId) {
      scrolledTo.current = null;
      return;
    }
    // Once per link, so typing amounts in an editable sheet does not keep scrolling.
    const el = document.querySelector('.cr-highlight');
    if (el && scrolledTo.current !== highlightInvoiceId) {
      scrolledTo.current = highlightInvoiceId;
      el.scrollIntoView({ block: 'center' });
    }
  }, [highlightInvoiceId, rows]);

  const openTransaction = (tx: CashTransaction) => {
    setReadOnly(false);
    setHighlightInvoiceId(null);
    setRows(rowsOfTransaction(tx));
    setEditing({ number: tx.transactionNumber, version: tx.version, voucherNumber: tx.voucherNumber });
    setTransactionInput(tx.transactionNumber);
    setSelectedKey(null);
    setSaved(null);
    if (isAdmin) setBranchId(tx.branchId);
    resetForm();
  };

  /** Resolves true when the transaction was loaded. */
  const handleLoad = async (raw = transactionInput): Promise<boolean> => {
    setTxOpen(false);
    setLoadError(null);
    const number = normalizeTransactionNumber(raw, kind);
    if (!number) {
      toast.error('Enter a transaction number like T-0001');
      return false;
    }
    if (rows.length > 0 && !window.confirm('Discard the entries on screen and load this transaction?')) return false;
    try {
      openTransaction(await loadTransaction.mutateAsync(number));
      setNotice(null);
      return true;
    } catch (error) {
      // Also toasted by the hook; kept on the page so a failed load is never silent.
      setLoadError(error instanceof ApiError ? `${number}: ${error.message}` : `${number}: could not be loaded`);
      return false;
    }
  };

  // A link from the transactions list (`?transaction=T-0001`) opens that transaction straight away.
  const handleLoadRef = useRef(handleLoad);
  handleLoadRef.current = handleLoad;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  // A link to a PT- transaction opens the purchase sheet first; the load runs once that sheet is showing.
  const [pendingLink, setPendingLink] = useState<{ number: string; params: URLSearchParams; kind: ReceiptKind } | null>(null);
  const loadFromLink = useCallback(
    async (number: string, params: URLSearchParams) => {
      setTransactionInput(number);
      const loaded = await handleLoadRef.current(number);
      if (loaded) {
        // From the ledger: view only. From a payment: editable as usual. Either way the entry of that invoice is highlighted.
        if (params.get('readonly') === '1') setReadOnly(true);
        setHighlightInvoiceId(params.get('invoice'));
      }
    },
    [],
  );
  const openFromUrl = useCallback(
    async (number: string, params: URLSearchParams) => {
      const wanted: ReceiptKind = /^pt-?/i.test(number.trim()) ? 'purchase' : 'sale';
      // Clear the link so opening the same transaction again from the list loads it again.
      router.replace('/sales/cash-receipt');
      if (wanted !== kindRef.current) {
        setKind(wanted);
        setPendingLink({ number, params, kind: wanted });
        return;
      }
      await loadFromLink(number, params);
    },
    [router, loadFromLink],
  );
  useEffect(() => {
    if (!pendingLink || pendingLink.kind !== kind) return;
    setPendingLink(null);
    void loadFromLink(pendingLink.number, pendingLink.params);
  }, [pendingLink, kind, loadFromLink]);

  const exitEditing = () => {
    setReadOnly(false);
    setHighlightInvoiceId(null);
    setEditing(null);
    setTransactionInput(lastNumber ?? txPrefix);
    setLoadError(null);
    setRows([]);
    setSelectedKey(null);
    setNotice(null);
    resetForm();
  };

  const handleSaveEdits = useCallback(async () => {
    if (readOnly || !editing || rows.length === 0 || updateTransaction.isPending) return;
    const withErrors = rows.map((r) => ({ ...r, error: r.error === VOIDED ? VOIDED : amountError(r.amount, r.balance, r.difference) }));
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
          rows: rows.map((r) => ({
            entryId: r.entryId,
            invoiceId: r.invoiceId,
            amount: Number(r.amount),
            // Always sent: an entry's difference is edited in place, and 0 takes it off.
            difference: num(r.difference),
          })),
        },
      });
      // Back to a clean sheet, like after a new receipt: the number stays in the box, ready to Load again.
      setEditing(null);
      setRows([]);
      setSelectedKey(null);
      setLoadError(null);
      setNotice(null);
      setSaved(null);
      setTransactionInput(tx.transactionNumber);
      resetForm();
      toast.success(`Saved edits to ${tx.transactionNumber} (version ${tx.version}), total Rs. ${money(tx.total)}`);
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
  }, [editing, readOnly, rows, updateTransaction, loadTransaction]);

  const handleSave = useCallback(async () => {
    if (readOnly) return;
    if (editing) return handleSaveEdits();
    if (rows.length === 0 || save.isPending) return;
    const withErrors = rows.map((r) => ({ ...r, error: amountError(r.amount, r.balance, r.difference) }));
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
        rows: rows.map((r) => ({
          invoiceId: r.invoiceId,
          amount: Number(r.amount),
          ...(num(r.difference) > 0 ? { difference: num(r.difference) } : {}),
        })),
      });
      setSaved(result);
      if (result.transactionNumber) setTransactionInput(result.transactionNumber);
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
  }, [rows, save, branchId, batchId, editing, readOnly, handleSaveEdits]);

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
    } else if (e.key === 'Delete' && !inInput && selectedKey && !readOnly) {
      e.preventDefault();
      removeRow(selectedKey);
    } else if (e.key === 'Enter' && inInput) {
      e.preventDefault();
      voucherRef.current?.focus();
    }
  };

  const printPath = (suffix = '') =>
    `${RECEIPT_KIND[kind].root}/${saved!.id}/pdf?branchId=${branchId ?? ''}${suffix}`;

  return (
    <PageAccessGuard requires={['cash_receipt:read', 'cash_payment:read']}>
      <TopbarContent>
        <h1 className="text-lg font-semibold tracking-tight">{text.title}</h1>
        <div className="ml-4 inline-flex rounded-md border p-0.5" role="group" aria-label="Receipt type">
          {(['sale', 'purchase'] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={kind === k ? 'default' : 'ghost'}
              aria-pressed={kind === k}
              disabled={rows.length > 0 || !!editing || !has(`${RECEIPT_KIND[k].permission}:read`)}
              onClick={() => {
                setKind(k);
                setTransactionInput(RECEIPT_KIND[k].prefix);
                setSaved(null);
                setNotice(null);
                setLoadError(null);
                resetForm();
              }}
            >
              {k === 'sale' ? 'Sales' : 'Purchase'}
            </Button>
          ))}
        </div>
        <div className="ml-4">
          <BranchFilter filter={branchFilter} allowAll={false} disabled={rows.length > 0} />
        </div>
      </TopbarContent>

      {isAdmin && !branchId && (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>{text.branchHint}</span>
        </Alert>
      )}

      {saved && (
        <Alert className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span>
            {saved.transactionNumber && <b>{saved.transactionNumber}: </b>}
            {saved.count} {text.saved}{saved.count === 1 ? '' : 's'} saved, total Rs. {money(saved.total)} (
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

      {loadTransaction.isPending && (
        <Alert className="mb-4">
          <span>Loading {normalizeTransactionNumber(transactionInput) ?? 'transaction'}...</span>
        </Alert>
      )}

      {loadError && (
        <Alert variant="destructive" className="mb-4 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button size="sm" variant="ghost" onClick={() => setLoadError(null)}>
            Dismiss
          </Button>
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

      {editing && readOnly && (
        <Alert className="mb-4 flex flex-wrap items-center justify-between gap-3 border-primary">
          <span>
            Viewing <b>{editing.number}</b> ({editing.voucherNumber}, version {editing.version}) from the ledger. View only:
            nothing can be changed here.
          </span>
          <Button size="sm" variant="outline" onClick={exitEditing}>
            Close
          </Button>
        </Alert>
      )}

      {editing && !readOnly && (
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

      <div className={`mb-4 rounded-lg border bg-card p-4 ${readOnly ? 'hidden' : ''}`}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="relative w-64">
            <label className="mb-1 block text-sm font-medium">Transaction #</label>
            <div className="flex gap-1">
              <Input
                value={transactionInput}
                placeholder={`${txPrefix}0001`}
                className={editing ? 'border-primary ring-1 ring-primary' : undefined}
                onChange={(e) => {
                  // Keep the "T-" in front: typing just digits, or pasting "1", still reads as a T- number.
                  const v = e.target.value.toUpperCase();
                  setTransactionInput(v.startsWith(txPrefix) ? v : `${txPrefix}${v.replace(/^P?T-?/, '')}`);
                  setTxOpen(true);
                }}
                onFocus={(e) => {
                  setTxOpen(true);
                  // Typing replaces a prefilled number; the T- prefix is put back by onChange.
                  e.currentTarget.select();
                }}
                onBlur={() => setTimeout(() => setTxOpen(false), 150)}
                onKeyDown={onTransactionKeyDown}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={transactionInput.trim() === txPrefix || loadTransaction.isPending}
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="text-sm font-medium">{findBy === 'voucher' ? 'Voucher #' : text.party}</label>
              <div role="radiogroup" aria-label="Find invoices by" className="flex items-center gap-3 text-xs text-muted-foreground">
                {(
                  [
                    ['voucher', 'Voucher #'],
                    ['party', text.party],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-1">
                    <input
                      type="radio"
                      name="cash-receipt-find-by"
                      className="accent-primary"
                      checked={findBy === value}
                      disabled={readOnly || !!editing}
                      onChange={() => {
                        setFindBy(value);
                        setSelected(null);
                        setVoucherInput('');
                        setParty({ scope: '', id: '' });
                        setTicked(new Set());
                        setFormError(null);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {findBy === 'party' && (
              <ComboboxWithCreate
                options={partyOptions}
                value={partyId || undefined}
                onChange={(id) => {
                  setParty({ scope: partyScope, id });
                  setTicked(new Set());
                  setFormError(null);
                }}
                placeholder={`Search ${text.party.toLowerCase()}`}
                searchPlaceholder={`Search ${text.party.toLowerCase()}...`}
                emptyMessage={`No ${text.party.toLowerCase()} found.`}
                disabled={isAdmin && !branchId}
              />
            )}
            {findBy === 'voucher' && <Input
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
            />}
            {findBy === 'voucher' && open && voucherQuery && !selected && (
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
          {findBy === 'voucher' && (
            <>
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
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium">Difference</label>
            <div className="flex gap-1">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={differenceInput}
                disabled={!selected || !selected.payable}
                aria-label="Difference"
                onChange={(e) => {
                  setDifferenceInput(e.target.value);
                  setFormError(null);
                }}
                onKeyDown={onAmountKeyDown}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selected || !selected.payable || num(amountInput) <= 0}
                tabIndex={-1}
                title="Write off what is left after the amount"
                onClick={() =>
                  selected && setDifferenceInput(String(Math.max(round2(selected.balance - num(amountInput)), 0)))
                }
              >
                Settle
              </Button>
            </div>
          </div>
            </>
          )}
        </div>
        {num(differenceInput) > 0 && (
          <div className="mb-3 grid gap-3 text-sm md:grid-cols-4">
            {kind === 'sale' ? (
              <>
                <div>
                  <div className="text-muted-foreground">Exp Category</div>
                  <div className="font-semibold">Difference</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Exp Sub Category</div>
                  <div className="font-semibold">Sales Difference</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-muted-foreground">Booked to</div>
                <div className="font-semibold">Purchase Discount (income)</div>
              </div>
            )}
            <div className="md:col-span-2 self-end text-muted-foreground" data-testid="difference-note">
              {money(num(amountInput))} + {money(num(differenceInput))} difference = {money(num(amountInput) + num(differenceInput))}
              {selected && Math.abs(num(amountInput) + num(differenceInput) - selected.balance) < 0.005
                ? ' — invoice will be set to paid'
                : ''}
            </div>
          </div>
        )}
        {formError && <p className="mb-2 text-sm text-destructive">{formError}</p>}

        {findBy === 'voucher' && (
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {[
            ['Account Balance', accountBalance],
            [`${text.invoiceCol} Amount`, selected?.netTotal ?? null],
            [`${text.settledCol} Amount`, selected?.received ?? null],
            ['Balance', selected?.balance ?? null],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="text-muted-foreground">{label}</div>
              <div className="font-semibold tabular-nums">{value === null ? '-' : money(value as number)}</div>
            </div>
          ))}
        </div>
        )}

        {findBy === 'party' && partyId && (
          <div className="mt-4 rounded-md border">
            <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2 font-medium">
                <Checkbox
                  checked={allTicked}
                  disabled={tickable.length === 0}
                  onCheckedChange={(v) => toggleAllTicks(v === true)}
                  aria-label="Select all invoices"
                />
                {partyFetching
                  ? 'Loading...'
                  : `${partyInvoices.length} unpaid or partly paid ${partyInvoices.length === 1 ? 'invoice' : 'invoices'}`}
              </label>
              <Button type="button" size="sm" disabled={tickedNow.length === 0} onClick={addTicked}>
                Add selected ({tickedNow.length})
              </Button>
            </div>
            {partyInvoices.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {partyFetching ? 'Searching...' : 'No outstanding invoices for this party'}
              </p>
            ) : (
              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>{text.invoiceCol}#</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">{text.invoiceCol} Amount</TableHead>
                      <TableHead className="text-right">{text.settledCol} Amount</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partyInvoices.map((inv) => {
                      const already = inSheet(inv.id);
                      return (
                        <TableRow key={inv.id} className={already ? 'text-muted-foreground' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={already || ticked.has(inv.id)}
                              disabled={already}
                              onCheckedChange={(v) => toggleTick(inv.id, v === true)}
                              aria-label={`Select ${inv.invoiceNumber}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {inv.invoiceNumber}
                            {already && <span className="ml-2 text-xs">Already in sheet</span>}
                          </TableCell>
                          <TableCell>{fmtDate(inv.saleDate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(inv.netTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(inv.received)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{money(inv.balance)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border" onKeyDown={onTableKeyDown}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ser #</TableHead>
              <TableHead>A/C Description</TableHead>
              <TableHead className="text-right">{kind === 'sale' ? 'Cust. Bal.' : 'Vendor Bal.'}</TableHead>
              <TableHead>{text.invoiceCol}#</TableHead>
              <TableHead className="text-right">{text.invoiceCol} Amount</TableHead>
              <TableHead className="text-right">{text.settledCol} Amount</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">Final Bal.</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                  No entries yet. Type a voucher number above, or load a transaction.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow
                key={r.key}
                data-state={r.key === selectedKey ? 'selected' : undefined}
                className={
                  highlightInvoiceId && r.invoiceId === highlightInvoiceId
                    ? 'cr-highlight bg-primary/10 [&>td:first-child]:border-l-4 [&>td:first-child]:border-primary'
                    : r.key === selectedKey
                      ? 'bg-muted'
                      : undefined
                }
                onClick={() => setSelectedKey(r.key)}
              >
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{r.customerName}</TableCell>
                <TableCell className="text-right tabular-nums">{money(computed[i].custBal)}</TableCell>
                <TableCell>{r.invoiceNumber}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.voucherAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.received)}</TableCell>
                <TableCell className="text-right">
                  {readOnly ? (
                    <span className="tabular-nums">{money(Number(r.amount))}</span>
                  ) : (
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
                    disabled={r.locked}
                    title={r.locked ? 'Fully paid: remove this entry to change it' : undefined}
                    onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                  />
                  )}
                  {!readOnly && (r.error || amountError(r.amount, r.balance, r.difference)) && (
                    <div className="mt-1 text-xs text-destructive">{r.error ?? amountError(r.amount, r.balance, r.difference)}</div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readOnly || r.locked ? (
                    <span className="tabular-nums">{num(r.difference) > 0 ? money(num(r.difference)) : '-'}</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label="Row difference"
                      className="ml-auto h-8 w-24 text-right"
                      value={r.difference}
                      onChange={(e) => updateRow(r.key, { difference: e.target.value })}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(computed[i].finalBal)}</TableCell>
                <TableCell>
                  {!readOnly && (
                    <Button variant="ghost" size="sm" aria-label="Remove row" onClick={() => removeRow(r.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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
            {differenceTotal > 0 && (
              <>
                {' '}
                + Difference: <b className="tabular-nums">Rs. {money(differenceTotal)}</b>
              </>
            )}
          </span>
        </div>
      </div>

      {!readOnly && (
      <div className="mt-4 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={
            !has(`${RECEIPT_KIND[kind].permission}:${editing ? 'update' : 'create'}`) ||
            rows.length === 0 ||
            save.isPending ||
            updateTransaction.isPending
          }
        >
          {save.isPending || updateTransaction.isPending ? 'Saving...' : editing ? 'Save edits' : 'Save'}
        </Button>
      </div>
      )}

      <Suspense fallback={null}>
        {/* Wait for the unsaved draft to be restored first, so the load replaces it knowingly. */}
        {restored && <OpenFromUrl param="transaction" onOpen={openFromUrl} />}
      </Suspense>
    </PageAccessGuard>
  );
}
