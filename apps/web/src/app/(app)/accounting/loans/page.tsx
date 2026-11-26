'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { useShownRows } from '@/hooks/use-shown-rows';
import { PageHeader } from '@/components/layout/page-header';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { StatCards } from '@/components/layout/stat-cards';
import { ReportButton } from '@/components/layout/report-button';
import { BranchField } from '@/components/branch-field';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { useLoans } from '@/hooks/use-loans';
import { usePermissions } from '@/hooks/use-permissions';
import type { FundsAccount, Loan } from '@medicore/shared-types';

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => n.toFixed(2);
const num = (v: string) => (v === '' ? 0 : Number(v));

function FundsSelect({ value, onChange, label }: { value: FundsAccount; onChange: (v: FundsAccount) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as FundsAccount)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CASH">Cash</SelectItem>
          <SelectItem value="BANK">Bank</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function NewLoanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const branch = useBranchFieldValue(open, { preselect: true });
  const { create } = useLoans(null);
  const [lender, setLender] = useState('');
  const [principal, setPrincipal] = useState('');
  const [loanDate, setLoanDate] = useState(todayISO());
  const [method, setMethod] = useState<FundsAccount>('CASH');
  const [notes, setNotes] = useState('');
  const canSave = !!branch.value && lender.trim() !== '' && num(principal) > 0;

  // The error toast comes from the hook; the dialog stays open so nothing typed is lost.
  const save = () =>
    create.mutate(
      { branchId: branch.value, lender: lender.trim(), principal: num(principal), loanDate, method, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          setLender('');
          setPrincipal('');
          setNotes('');
          onOpenChange(false);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record a Loan</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Money you borrowed. It goes into Cash or Bank and is owed as Loans Payable.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BranchField field={branch.field} value={branch.value} onChange={branch.setValue} error={branch.error} id="loanBranch" />
          <div className="space-y-1.5">
            <Label htmlFor="lender">Lender</Label>
            <Input id="lender" placeholder="Bank or person" value={lender} onChange={(e) => setLender(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="principal">Amount borrowed</Label>
            <Input id="principal" type="number" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </div>
          <FundsSelect label="Received in" value={method} onChange={setMethod} />
          <div className="space-y-1.5">
            <Label htmlFor="loanDate">Date</Label>
            <Input id="loanDate" type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loanNotes">Notes</Label>
            <Input id="loanNotes" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || create.isPending} onClick={save}>
            {create.isPending ? 'Saving...' : 'Record Loan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const fundsLabel: Record<FundsAccount, string> = { CASH: 'Cash', BANK: 'Bank' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

/** One loan with every installment paid against it. */
function LoanDetailDialog({ loan, onClose, onRepay, canRepay }: { loan: Loan | null; onClose: () => void; onRepay: (l: Loan) => void; canRepay: boolean }) {
  const repayments = loan ? [...loan.repayments].sort((a, b) => a.date.localeCompare(b.date)) : [];
  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Loan {loan?.loanNumber ?? ''} · {loan?.lender}
          </DialogTitle>
        </DialogHeader>
        {loan && (
          <div className="space-y-4">
            <StatCards
              className="mb-0"
              items={[
                { title: 'Borrowed', value: loan.principal, hint: `${fmtDate(loan.loanDate)} · into ${fundsLabel[loan.method]}` },
                { title: 'Principal repaid', value: loan.principalRepaid },
                { title: 'Interest paid', value: loan.interestPaid },
                { title: 'Outstanding', value: loan.outstanding },
              ]}
            />
            {loan.notes && <p className="text-sm text-muted-foreground">Notes: {loan.notes}</p>}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Total paid</TableHead>
                    <TableHead>Paid from</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repayments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No repayments yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {repayments.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{fmtDate(r.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.principal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.interest)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.principal + r.interest)}</TableCell>
                      <TableCell>{fundsLabel[r.method]}</TableCell>
                      <TableCell>{r.notes ?? ''}</TableCell>
                    </TableRow>
                  ))}
                  {repayments.length > 0 && (
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(loan.principalRepaid)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(loan.interestPaid)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(loan.principalRepaid + loan.interestPaid)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {loan && loan.outstanding > 0.005 && (
            <Button disabled={!canRepay} onClick={() => onRepay(loan)}>
              Repay
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepayDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const { repay } = useLoans(null);
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<FundsAccount>('CASH');
  const [notes, setNotes] = useState('');
  const tooMuch = !!loan && num(principal) > loan.outstanding + 0.005;
  const canSave = !!loan && num(principal) + num(interest) > 0 && !tooMuch;

  const save = () => {
    if (!loan) return;
    repay.mutate(
      { id: loan.id, dto: { date, principal: num(principal), interest: num(interest), method, notes: notes.trim() || undefined } },
      {
        onSuccess: () => {
          setPrincipal('');
          setInterest('');
          setNotes('');
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Repay loan{loan ? ` from ${loan.lender}` : ''}</DialogTitle>
        </DialogHeader>
        {loan && <p className="text-sm text-muted-foreground">Outstanding: {money(loan.outstanding)}. Principal reduces the loan; interest is an expense.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="repPrincipal">Principal paid</Label>
            <Input id="repPrincipal" type="number" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
            {tooMuch && <p className="text-xs text-destructive">More than is outstanding.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repInterest">Interest paid</Label>
            <Input id="repInterest" type="number" min="0" step="0.01" placeholder="0" value={interest} onChange={(e) => setInterest(e.target.value)} />
          </div>
          <FundsSelect label="Paid from" value={method} onChange={setMethod} />
          <div className="space-y-1.5">
            <Label htmlFor="repDate">Date</Label>
            <Input id="repDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="repNotes">Notes</Label>
            <Input id="repNotes" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave || repay.isPending} onClick={save}>
            {repay.isPending ? 'Saving...' : 'Record Repayment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LoansPage() {
  const { has } = usePermissions();
  const { branchId } = useBranchFilter();
  const { loans, isLoading, error } = useLoans(branchId);
  const shown = useShownRows(loans);
  const [newOpen, setNewOpen] = useState(false);
  const [repaying, setRepaying] = useState<Loan | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const canCreate = has('acc_loans:create');

  const totals = useMemo(
    () => ({
      borrowed: shown.rows.reduce((n, l) => n + l.principal, 0),
      repaid: shown.rows.reduce((n, l) => n + l.principalRepaid, 0),
      outstanding: shown.rows.reduce((n, l) => n + l.outstanding, 0),
      interest: shown.rows.reduce((n, l) => n + l.interestPaid, 0),
    }),
    [shown.rows],
  );

  const columns = useMemo<ColumnDef<Loan>[]>(
    () => [
      { accessorKey: 'loanNumber', header: 'Loan #' },
      { accessorKey: 'lender', header: 'Lender' },
      { accessorKey: 'loanDate', header: 'Date', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      { accessorKey: 'principal', header: 'Borrowed', cell: ({ getValue }) => money(getValue() as number) },
      { accessorKey: 'principalRepaid', header: 'Repaid', cell: ({ getValue }) => money(getValue() as number) },
      { accessorKey: 'interestPaid', header: 'Interest paid', cell: ({ getValue }) => money(getValue() as number) },
      { accessorKey: 'outstanding', header: 'Outstanding', cell: ({ getValue }) => money(getValue() as number) },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant={getValue() === 'PAID' ? 'secondary' : 'default'}>{getValue() as string}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.outstanding > 0.005 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canCreate}
              onClick={(e) => {
                e.stopPropagation();
                setRepaying(row.original);
              }}
            >
              Repay
            </Button>
          ) : null,
      },
    ],
    [canCreate],
  );

  return (
    <PageAccessGuard requires="acc_loans:read">
      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        report={
          <ReportButton
            title="Loans"
            summary={[
              ['Loans', shown.rows.length],
              ['Total borrowed', money(totals.borrowed)],
              ['Principal repaid', money(totals.repaid)],
              ['Outstanding', money(totals.outstanding)],
              ['Interest paid', money(totals.interest)],
            ]}
            totalColumns={['Borrowed', 'Repaid', 'Interest paid', 'Outstanding']}
            rows={shown.rows.map((l) => ({
              'Loan #': l.loanNumber ?? '',
              Lender: l.lender,
              Date: new Date(l.loanDate).toLocaleDateString('en-CA'),
              Borrowed: money(l.principal),
              Repaid: money(l.principalRepaid),
              'Interest paid': money(l.interestPaid),
              Outstanding: money(l.outstanding),
              Status: l.status,
            }))}
          />
        }
        title="Loans"
        description="Money you borrowed, what you have repaid, and the interest paid."
        actions={
          <Button disabled={!canCreate} onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record Loan
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load loans</span>
        </Alert>
      )}

      {!isLoading && (
        <StatCards
          items={[
            { title: 'Loans', value: shown.rows.length, count: true },
            { title: 'Total borrowed', value: totals.borrowed },
            { title: 'Principal repaid', value: totals.repaid },
            { title: 'Outstanding', value: totals.outstanding, hint: 'Owed (Loans Payable)' },
            { title: 'Interest paid', value: totals.interest, hint: 'Shown in Profit & Loss' },
          ]}
        />
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <DataTable
          onFilteredRowsChange={shown.onFilteredRowsChange}
          columns={columns}
          data={loans}
          onRowClick={(l) => setViewingId(l.id)}
          searchPlaceholder="Search loans..."
          emptyMessage="No loans yet. Use Record Loan."
        />
      )}

      <NewLoanDialog open={newOpen} onOpenChange={setNewOpen} />
      <LoanDetailDialog
        loan={loans.find((l) => l.id === viewingId) ?? null}
        onClose={() => setViewingId(null)}
        canRepay={canCreate}
        onRepay={(l) => {
          setViewingId(null);
          setRepaying(l);
        }}
      />
      <RepayDialog loan={repaying} onClose={() => setRepaying(null)} />
    </PageAccessGuard>
  );
}
