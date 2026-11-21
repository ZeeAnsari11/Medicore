'use client';

import { useMemo, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { PageAccessGuard } from '@/components/layout/page-access-guard';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@medicore/ui';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { useLocations } from '@/hooks/use-locations';
import { usePermissions } from '@/hooks/use-permissions';
import { CityQuickCreateDialog, NameDialog, TerritoryQuickCreateDialog } from '../customers/components/location-quick-create-dialogs';

type Rename = { kind: 'city' | 'territory'; id: string; name: string } | null;

/** The shared city and territory lists the customer form picks from. */
export default function LocationsPage() {
  const branchFilter = useBranchFilter();
  // Lists follow the top-bar branch; "All branches" shows every branch's, each tagged with its branch.
  const { cities, territories, isLoading, updateCity, updateTerritory } = useLocations(true, branchFilter.branchId);
  const branchName = (id: string) => branchFilter.branches.find((b) => b.id === id)?.name ?? '';
  const { has } = usePermissions();
  const canCreate = has('locations:create');
  const canEdit = has('locations:update');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cityDialog, setCityDialog] = useState(false);
  const [territoryDialog, setTerritoryDialog] = useState(false);
  const [rename, setRename] = useState<Rename>(null);

  const selected = cities.find((c) => c.id === selectedId) ?? cities[0] ?? null;
  const inCity = useMemo(() => territories.filter((t) => t.cityId === selected?.id), [territories, selected]);

  const row = (key: string, name: string, isActive: boolean, branch: string, onRename: () => void, onToggle: () => void, onPick?: () => void, active = false) => (
    <li key={key} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${active ? 'border-primary bg-accent' : ''}`}>
      <button type="button" className="flex-1 text-left text-sm font-medium" onClick={onPick} disabled={!onPick}>
        {name}
      </button>
      {!branchFilter.branchId && branch && <Badge variant="outline">{branch}</Badge>}
      {!isActive && <Badge variant="outline">Inactive</Badge>}
      {canEdit && (
        <>
          <Button size="sm" variant="ghost" onClick={onRename}>
            Rename
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </>
      )}
    </li>
  );

  return (
    <PageAccessGuard requires="locations:read">
      <PageHeader title="Cities & Territories" description="The lists customers are placed in; they appear as dropdowns on the customer form" />

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Cities</CardTitle>
              <Button size="sm" onClick={() => setCityDialog(true)} disabled={!canCreate}>
                <Plus className="mr-1 h-4 w-4" />
                New City
              </Button>
            </CardHeader>
            <CardContent>
              {cities.length === 0 ? (
                <EmptyState icon={MapPin} title="No cities yet" description="Add a city, then the territories inside it" />
              ) : (
                <ul className="space-y-2">
                  {cities.map((c) =>
                    row(c.id, c.name, c.isActive, branchName(c.branchId), () => setRename({ kind: 'city', id: c.id, name: c.name }), () => void updateCity({ id: c.id, isActive: !c.isActive }), () => setSelectedId(c.id), c.id === selected?.id),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{selected ? `Territories in ${selected.name}` : 'Territories'}</CardTitle>
              <Button size="sm" onClick={() => setTerritoryDialog(true)} disabled={!canCreate || !selected}>
                <Plus className="mr-1 h-4 w-4" />
                New Territory
              </Button>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground">Select a city.</p>
              ) : inCity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No territories in this city yet.</p>
              ) : (
                <ul className="space-y-2">
                  {inCity.map((t) =>
                    row(t.id, t.name, t.isActive, branchName(t.branchId), () => setRename({ kind: 'territory', id: t.id, name: t.name }), () => void updateTerritory({ id: t.id, isActive: !t.isActive })),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <CityQuickCreateDialog open={cityDialog} branchId={null} onOpenChange={setCityDialog} onCreated={() => undefined} />
      <TerritoryQuickCreateDialog open={territoryDialog} city={selected} onOpenChange={setTerritoryDialog} onCreated={() => undefined} />
      <NameDialog
        open={!!rename}
        title={rename?.kind === 'city' ? 'Rename City' : 'Rename Territory'}
        description="Customers using it are renamed too"
        label={rename?.kind === 'city' ? 'City' : 'Territory'}
        placeholder=""
        initialName={rename?.name}
        isCreating={false}
        submitLabel="Rename"
        onOpenChange={(open) => !open && setRename(null)}
        onSubmit={async (name) => {
          if (!rename) return;
          if (rename.kind === 'city') await updateCity({ id: rename.id, name });
          else await updateTerritory({ id: rename.id, name });
        }}
      />
    </PageAccessGuard>
  );
}
