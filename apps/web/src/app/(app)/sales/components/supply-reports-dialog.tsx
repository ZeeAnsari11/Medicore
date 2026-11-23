'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
} from '@medicore/ui';
import { MultiSelect } from '@/components/ssr/multi-select';
import { useBranches } from '@/hooks/use-branches';
import { useDocumentPdf } from '@/hooks/use-document-pdf';
import { useOrderBookers } from '@/hooks/use-sales';
import { useCustomers } from '@/hooks/use-customers';
import { useLocations } from '@/hooks/use-locations';
import { usePermissions } from '@/hooks/use-permissions';
import { CityQuickCreateDialog, TerritoryQuickCreateDialog } from '../../customers/components/location-quick-create-dialogs';
import { SUPPLY_MAX_DAYS, supplyLedgerPath, supplySummaryPath, useSupplyFilters } from '@/hooks/use-supply-reports';
import { NO_CITY_FILTER, NO_TERRITORY_FILTER, territoriesOfCities } from '@medicore/shared-types';
import type { SupplyReportQuery } from '@medicore/shared-types';

type Preset = 'today' | 'week' | 'month' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function presetRange(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const now = new Date();
  if (preset === 'today') return { from: day(now), to: day(now) };
  if (preset === 'week') {
    // Monday to today.
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: day(monday), to: day(now) };
  }
  return { from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to: day(now) };
}

const PRESETS: Array<[Preset, string]> = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['custom', 'Custom'],
];

interface SupplyReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The branch the Sales page is showing (null for "All branches"); the reports are for one branch at a time. */
  branchId: string | null;
  /** Admins with several branches get a branch dropdown; everyone else is fixed to `branchId`. */
  canPickBranch: boolean;
  /** Only users who can see everyone's sales may pick order bookers. */
  canPickBookers: boolean;
}

/** Filters for the Supply Ledger and Supply Summary PDFs. */
export function SupplyReportsDialog({ open, onOpenChange, branchId: pageBranchId, canPickBranch, canPickBookers }: SupplyReportsDialogProps) {
  const { openPdf, isOpening } = useDocumentPdf();
  const [preset, setPreset] = useState<Preset>('today');
  const [range, setRange] = useState(() => presetRange('today'));
  const [invoiceFrom, setInvoiceFrom] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  // Everything starts ticked: what is stored is what was unticked, so new cities and territories arrive ticked.
  const [offCities, setOffCities] = useState<string[]>([]);
  const [offTerritories, setOffTerritories] = useState<string[]>([]);
  const [offManufacturers, setOffManufacturers] = useState<string[]>([]);
  const [bookerIds, setBookerIds] = useState<string[]>([]);
  const [customerIds, setCustomerIds] = useState<string[]>([]);

  const { branches } = useBranches();
  // The sheet is for one branch: what the user picked, else the Sales page's branch, else the main branch.
  const [pickedBranch, setPickedBranch] = useState<string | null>(null);
  const mainBranchId = (branches.find((b) => b.isMain) ?? branches[0])?.id ?? null;
  const branchId = pickedBranch ?? pageBranchId ?? mainBranchId;

  const filters = useSupplyFilters(branchId, open);
  const { orderBookers } = useOrderBookers(branchId, open && canPickBookers);
  const { customers } = useCustomers(undefined, branchId ?? undefined);

  // The branch's own lists too, so a city or territory created here shows up before any customer uses it.
  const { cities: cityList, territories: territoryList } = useLocations(open && !!branchId, branchId);
  const { has } = usePermissions();
  const canCreate = has('locations:create') && !!branchId;
  const [cityDialog, setCityDialog] = useState(false);
  const [territoryDialog, setTerritoryDialog] = useState(false);
  const merged = (used: string[], listed: string[]) => [...new Set([...used, ...listed])].sort((a, b) => a.localeCompare(b));
  const cityNames = merged(filters.cities, cityList.filter((c) => c.isActive).map((c) => c.name));
  const cityChoices = cityList.filter((c) => c.isActive);
  const cityValues = [...cityNames, NO_CITY_FILTER];
  const cities = cityValues.filter((c) => !offCities.includes(c));
  // Territories follow the ticked cities: unticking a city removes its territories from the list.
  const cityIdName = new Map(cityList.map((c) => [c.id, c.name]));
  const places = [
    ...filters.places,
    ...territoryList.filter((t) => t.isActive).flatMap((t) => (cityIdName.has(t.cityId) ? [{ city: cityIdName.get(t.cityId)!, territory: t.name }] : [])),
  ];
  // The selected branch's manufacturers, all ticked to start with.
  const manufacturerValues = filters.manufacturers.map((m) => m.id);
  const manufacturers = manufacturerValues.filter((m) => !offManufacturers.includes(m));
  const territoryValues = territoriesOfCities(cities, places);
  const territories = territoryValues.filter((t) => !offTerritories.includes(t));
  const cityLabel = (v: string) => (v === NO_CITY_FILTER ? 'No city' : v);
  const territoryLabel = (v: string) => (v === NO_TERRITORY_FILTER ? 'No territory' : v);
  const tickedCity = cityList.find((c) => cities.length === 1 && c.name.toLowerCase() === cities[0].toLowerCase());
  const bookerOptions = useMemo(() => orderBookers.map((b) => ({ value: b.id, label: b.name })), [orderBookers]);
  const customerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: c.name })), [customers]);

  const chooseBranch = (id: string) => {
    setPickedBranch(id);
    // City, territory, booker and customer lists belong to a branch, so earlier picks no longer apply.
    setOffCities([]);
    setOffTerritories([]);
    setOffManufacturers([]);
    setBookerIds([]);
    setCustomerIds([]);
  };

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  // An invoice number range picks the invoices by itself: the period is not applied (or checked).
  const byInvoice = !!(invoiceFrom || invoiceTo);
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  const problem = !branchId
    ? 'Choose a branch first: invoice numbers repeat across branches.'
    : !filters.ready
      ? 'Loading cities…'
      : cities.length === 0
        ? 'Select at least one city.'
        : territories.length === 0
          ? 'Select at least one territory.'
          : manufacturerValues.length > 0 && manufacturers.length === 0
            ? 'Select at least one manufacturer.'
            : invoiceFrom && invoiceTo && Number(invoiceFrom) > Number(invoiceTo)
      ? 'Invoice "from" is after "to".'
      : byInvoice
        ? null
        : !range.from || !range.to
          ? 'Choose both dates.'
          : days < 0
            ? '"From" is after "To".'
            : days > SUPPLY_MAX_DAYS
              ? `Choose a period of at most ${SUPPLY_MAX_DAYS} days.`
              : null;

  const query: SupplyReportQuery = {
    from: byInvoice ? undefined : range.from,
    to: byInvoice ? undefined : range.to,
    branchId: branchId ?? undefined,
    invoiceFrom: invoiceFrom || undefined,
    invoiceTo: invoiceTo || undefined,
    city: cities,
    territory: territories,
    orderBookerIds: bookerIds,
    customerIds,
    // Only sent when some are unticked: all ticked means every manufacturer.
    manufacturerIds: manufacturers.length === manufacturerValues.length ? undefined : manufacturers,
  };

  const clear = () => {
    setInvoiceFrom('');
    setInvoiceTo('');
    setOffCities([]);
    setOffTerritories([]);
    setOffManufacturers([]);
    setBookerIds([]);
    setCustomerIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Supply reports</DialogTitle>
          <DialogDescription>Printable sheets for the supply run: invoices with their lines, and a summary to collect against.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canPickBranch && (
            <div className="space-y-1.5">
              <Label htmlFor="supplyBranch">Branch</Label>
              <Select value={branchId ?? ''} onValueChange={chooseBranch}>
                <SelectTrigger id="supplyBranch" aria-label="Branch" className="w-64">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.isMain ? `${b.name} (Main)` : b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Period</Label>
            {byInvoice && <p className="text-xs text-muted-foreground">Not applied while an invoice number range is set.</p>}
            <div className={`space-y-2 ${byInvoice ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={byInvoice}>
              <div className="flex flex-wrap items-center gap-2">
                {PRESETS.map(([p, label]) => (
                  <Button key={p} size="sm" variant={preset === p ? 'default' : 'outline'} onClick={() => choosePreset(p)}>
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-sm">
                  From
                  <Input
                    type="date"
                    className="w-40"
                    value={range.from}
                    max={range.to || undefined}
                    onChange={(e) => {
                      setPreset('custom');
                      setRange((r) => ({ ...r, from: e.target.value }));
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  To
                  <Input
                    type="date"
                    className="w-40"
                    value={range.to}
                    min={range.from || undefined}
                    onChange={(e) => {
                      setPreset('custom');
                      setRange((r) => ({ ...r, to: e.target.value }));
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Label className="w-full">Invoice number (optional)</Label>
            <Input className="w-32" inputMode="numeric" placeholder="From" value={invoiceFrom} onChange={(e) => setInvoiceFrom(e.target.value.replace(/\D/g, ''))} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input className="w-32" inputMode="numeric" placeholder="To" value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value.replace(/\D/g, ''))} />
          </div>

          <div className="flex flex-wrap gap-2">
            <MultiSelect label="City" allLabel="All cities" allWhenFull selectAll options={cityValues.map((v) => ({ value: v, label: cityLabel(v) }))} value={cities} onChange={(next) => setOffCities(cityValues.filter((c) => !next.includes(c)))} onCreateNew={canCreate ? () => setCityDialog(true) : undefined} createLabel="Create city" />
            <MultiSelect label="Territory" allLabel="All territories" allWhenFull selectAll options={territoryValues.map((v) => ({ value: v, label: territoryLabel(v) }))} value={territories} onChange={(next) => setOffTerritories(territoryValues.filter((t) => !next.includes(t)))} onCreateNew={canCreate ? () => setTerritoryDialog(true) : undefined} createLabel="Create territory" />
            {canPickBookers && <MultiSelect label="Order Booker" selectAll options={bookerOptions} value={bookerIds} onChange={setBookerIds} />}
            <MultiSelect label="Manufacturer" allLabel="All manufacturers" allWhenFull selectAll options={filters.manufacturers.map((m) => ({ value: m.id, label: m.name }))} value={manufacturers} onChange={(next) => setOffManufacturers(manufacturerValues.filter((m) => !next.includes(m)))} />
            <MultiSelect label="Customer" options={customerOptions} value={customerIds} onChange={setCustomerIds} />
          </div>

          {problem && <Alert variant="destructive">{problem}</Alert>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={clear}>
            Clear filters
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!problem || isOpening} onClick={() => void openPdf(supplySummaryPath(query))}>
              <FileText className="mr-2 h-4 w-4" />
              Supply Summary
            </Button>
            <Button disabled={!!problem || isOpening} onClick={() => void openPdf(supplyLedgerPath(query))}>
              <FileText className="mr-2 h-4 w-4" />
              Supply Ledger
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Created in the branch chosen above, then ticked in the list. */}
      <CityQuickCreateDialog
        open={cityDialog}
        branchId={branchId}
        onOpenChange={setCityDialog}
        onCreated={(name) => setOffCities((xs) => xs.filter((x) => x !== name))}
      />
      <TerritoryQuickCreateDialog
        open={territoryDialog}
        cityChoices={cityChoices}
        defaultCityId={tickedCity?.id}
        onOpenChange={setTerritoryDialog}
        onCreated={(name) => setOffTerritories((xs) => xs.filter((x) => x !== name))}
      />
    </Dialog>
  );
}
