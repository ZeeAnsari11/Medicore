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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ColumnDef,
} from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { useFixedAssets } from '@/hooks/use-fixed-assets';
import { usePermissions } from '@/hooks/use-permissions';
import type { AssetSource, FixedAsset, FundsAccount } from '@medicore/shared-types';

const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => n.toFixed(2);
const num = (v: string) => (v === '' ? 0 : Number(v));
const sourceLabel: Record<AssetSource, string> = { CASH: 'Paid from Cash', BANK: 'Paid from Bank', EXISTING: 'Already owned' };

function NewAssetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const branch = useBranchFieldValue(open, { preselect: true });
  const { create } = useFixedAssets(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [source, setSource] = useState<AssetSource>('CASH');
  const [notes, setNotes] = useState('');
  const canSave = !!branch.value && name.trim() !== '' && num(cost) > 0;

  const save = () =>
    create.mutate(
      {
        branchId: branch.value,
        name: name.trim(),
        cost: num(cost),
        purchaseDate,
        source,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setCost('');
          setNotes('');
          onOpenChange(false);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a Fixed Asset</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Something long-lived you own, such as a vehicle, a fridge or shop fittings.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BranchField field={branch.field} value={branch.value} onChange={branch.setValue} error={branch.error} id="assetBranch" />
          <div className="space-y-1.5">
            <Label htmlFor="assetName">Asset name</Label>
            <Input id="assetName" placeholder="e.g. Delivery van" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assetCost">Cost</Label>
            <Input id="assetCost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>How it was paid</Label>
            <Select value={source} onValueChange={(v) => setSource(v as AssetSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(sourceLabel) as AssetSource[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {sourceLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assetDate">Purchase date</Label>
            <Input id="assetDate" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assetNotes">Notes</Label>
            <Input id="assetNotes" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || create.isPending} onClick={save}>
            {create.isPending ? 'Saving...' : 'Add Asset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

/** One asset: what it cost, how it was paid, and what happened if it was sold or written off. */
function AssetDetailDialog({ asset, onClose }: { asset: FixedAsset | null; onClose: () => void }) {
  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Asset {asset?.assetNumber ?? ''} · {asset?.name}
          </DialogTitle>
        </DialogHeader>
        {asset && (
          <div className="mt-2 space-y-4">
            <StatCards
              className="mb-0"
              items={[
                { title: 'Cost', value: asset.cost, hint: `${fmtDate(asset.purchaseDate)} · ${sourceLabel[asset.source]}` },
                { title: 'Book value', value: asset.bookValue, hint: asset.status === 'DISPOSED' ? 'Disposed of' : 'On the Balance Sheet' },
              ]}
            />
            {asset.notes && <p className="text-sm text-muted-foreground">Notes: {asset.notes}</p>}
            {asset.disposal && (
              <p className="text-sm">
                {asset.disposal.proceeds > 0 ? 'Sold' : 'Written off'} on {fmtDate(asset.disposal.date)} for {money(asset.disposal.proceeds)}:{' '}
                {asset.disposal.gainLoss >= 0 ? 'gain' : 'loss'} of {money(Math.abs(asset.disposal.gainLoss))}.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeDialog({ asset, onClose }: { asset: FixedAsset | null; onClose: () => void }) {
  const { dispose } = useFixedAssets(null);
  const [proceeds, setProceeds] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<FundsAccount>('CASH');
  const gainLoss = asset ? num(proceeds) - asset.cost : 0;

  const save = () => {
    if (!asset) return;
    dispose.mutate(
      { id: asset.id, dto: { date, proceeds: num(proceeds), method } },
      {
        onSuccess: () => {
          setProceeds('');
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sell or write off{asset ? `: ${asset.name}` : ''}</DialogTitle>
        </DialogHeader>
        {asset && <p className="text-sm text-muted-foreground">Cost: {money(asset.cost)}. Enter 0 for a write-off.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="disposeProceeds">Sold for</Label>
            <Input id="disposeProceeds" type="number" min="0" step="0.01" placeholder="0" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Received in</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as FundsAccount)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="disposeDate">Date</Label>
            <Input id="disposeDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {asset && <p className="text-sm">{gainLoss >= 0 ? 'Gain' : 'Loss'} on disposal: {money(Math.abs(gainLoss))}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={dispose.isPending} onClick={save}>
            {dispose.isPending ? 'Saving...' : 'Dispose Asset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FixedAssetsPage() {
  const { has } = usePermissions();
  const { branchId } = useBranchFilter();
  const { assets, isLoading, error } = useFixedAssets(branchId);
  const shown = useShownRows(assets);
  const [newOpen, setNewOpen] = useState(false);
  const [disposing, setDisposing] = useState<FixedAsset | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const canCreate = has('acc_assets:create');

  const totals = useMemo(() => {
    const active = shown.rows.filter((a) => a.status === 'ACTIVE');
    return {
      cost: active.reduce((n, a) => n + a.cost, 0),
    };
  }, [shown.rows]);

  const columns = useMemo<ColumnDef<FixedAsset>[]>(
    () => [
      { accessorKey: 'assetNumber', header: 'Asset #' },
      { accessorKey: 'name', header: 'Asset' },
      { accessorKey: 'purchaseDate', header: 'Purchased', cell: ({ getValue }) => new Date(getValue() as string).toLocaleDateString() },
      { accessorKey: 'cost', header: 'Cost', cell: ({ getValue }) => money(getValue() as number) },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant={getValue() === 'DISPOSED' ? 'secondary' : 'default'}>{getValue() as string}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'ACTIVE' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canCreate}
              onClick={(e) => {
                e.stopPropagation();
                setDisposing(row.original);
              }}
            >
              Sell / write off
            </Button>
          ) : null,
      },
    ],
    [canCreate],
  );

  return (
    <PageAccessGuard requires="acc_assets:read">
      <PageHeader
        back={{ href: '/accounting', label: 'Back to Accounting' }}
        report={
          <ReportButton
            title="Fixed Assets"
            summary={[
              ['Assets', shown.rows.filter((a) => a.status === 'ACTIVE').length],
              ['Total cost', money(totals.cost)],
            ]}
            totalColumns={['Cost']}
            rows={shown.rows.map((a) => ({
              'Asset #': a.assetNumber ?? '',
              Asset: a.name,
              Purchased: new Date(a.purchaseDate).toLocaleDateString('en-CA'),
              Cost: money(a.cost),
              'Gain / (loss) on sale': a.disposal ? money(a.disposal.gainLoss) : '',
              Status: a.status,
            }))}
          />
        }
        title="Fixed Assets"
        description="What you own that lasts, kept at cost until it is sold or written off."
        actions={
          <Button disabled={!canCreate} onClick={() => setNewOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load assets</span>
        </Alert>
      )}

      {!isLoading && (
        <StatCards
          items={[
            { title: 'Assets', value: shown.rows.filter((a) => a.status === 'ACTIVE').length, count: true },
            { title: 'Total cost', value: totals.cost },
            { title: 'On the Balance Sheet', value: totals.cost, hint: 'At cost' },
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
          data={assets}
          onRowClick={(a) => setViewingId(a.id)}
          searchPlaceholder="Search assets..."
          emptyMessage="No assets yet. Use Add Asset."
        />
      )}

      <NewAssetDialog open={newOpen} onOpenChange={setNewOpen} />
      <AssetDetailDialog asset={assets.find((a) => a.id === viewingId) ?? null} onClose={() => setViewingId(null)} />
      <DisposeDialog asset={disposing} onClose={() => setDisposing(null)} />
    </PageAccessGuard>
  );
}
