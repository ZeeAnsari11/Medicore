'use client';

import { Checkbox, cn } from '@medicore/ui';
import { usePermissionModules, type PermissionModuleDef } from '@/hooks/use-permission-modules';

interface MenuPickerProps {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}

const keysOf = (m: PermissionModuleDef) => m.actions.map((a) => `${m.key}:${a.key}`);

/**
 * One checkbox per menu (Accounting sub-pages indented). A ticked menu is visible and fully
 * usable; unticked menus are hidden and blocked. Driven by `GET /permissions/modules`.
 */
export function MenuPicker({ value, onChange, disabled }: MenuPickerProps) {
  const { modules } = usePermissionModules();
  const selected = new Set(value);
  const isOn = (m: PermissionModuleDef) => selected.has(`${m.key}:read`);
  const allOn = modules.length > 0 && modules.every(isOn);

  const setMenus = (targets: PermissionModuleDef[], checked: boolean) => {
    const next = new Set(selected);
    targets.forEach((m) => keysOf(m).forEach((k) => (checked ? next.add(k) : next.delete(k))));
    onChange([...next]);
  };

  const groups = modules.reduce<string[]>((acc, m) => (acc.includes(m.group) ? acc : [...acc, m.group]), []);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={allOn} disabled={disabled} onCheckedChange={(c) => setMenus(modules, !!c)} />
        Select all menus
      </label>

      <div className="rounded-lg border bg-muted/30">
        {groups.map((group) => (
          <div key={group} className="border-b px-4 py-3 last:border-b-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            <div className="space-y-2">
              {modules
                .filter((m) => m.group === group)
                .map((m) => (
                  <label key={m.key} className={cn('flex items-center gap-2 text-sm', m.parent && 'pl-6')}>
                    <Checkbox
                      checked={isOn(m)}
                      disabled={disabled}
                      onCheckedChange={(c) =>
                        // The Accounting parent toggles all of its sub-pages too
                        setMenus(m.parent ? [m] : modules.filter((x) => x.key === m.key || x.parent === m.key), !!c)
                      }
                    />
                    {m.label}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
