import { PlaceChip } from '@medicore/ui';

/** A customer as plain text, "Ali Hamza - Theeng More": for pickers that can only show a string. */
export function customerLabel(c: { name: string; territory?: string | null }): string {
  const territory = c.territory?.trim();
  return territory ? `${c.name} - ${territory}` : c.name;
}

/** A customer as a picker option: the name, with the territory as its own chip (and searchable). */
export function customerOption(c: { id: string; name: string; territory?: string | null }) {
  return { value: c.id, label: c.name, place: c.territory?.trim() || undefined };
}

/** The name in bold with the territory chip after it, for list rows and Select items. */
export function CustomerName({ name, territory }: { name: string; territory?: string | null }) {
  const place = territory?.trim();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{name}</span>
      {place && <PlaceChip>{place}</PlaceChip>}
    </span>
  );
}
