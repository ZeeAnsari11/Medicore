'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import { BranchField } from '@/components/branch-field';
import { useBranchFieldValue } from '@/hooks/use-branch-field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@medicore/ui';
import { useLocations } from '@/hooks/use-locations';

interface NameValues {
  name: string;
}

interface NameDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder: string;
  initialName?: string;
  isCreating: boolean;
  /** Extra fields shown above the buttons (the Branch picker when creating a city). */
  extra?: React.ReactNode;
  /** Button text, `Create` unless renaming. */
  submitLabel?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}

export function NameDialog({ open, title, description, label, placeholder, initialName, isCreating, extra, submitLabel = 'Create', onOpenChange, onSubmit }: NameDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NameValues>({ values: { name: initialName ?? '' } });

  const submit = async ({ name }: NameValues) => {
    try {
      await onSubmit(name.trim());
    } catch {
      return; // the mutation already toasted the reason (e.g. the name exists)
    }
    onOpenChange(false);
    reset({ name: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            // React bubbles events through portals: never let this submit reach the customer form around it.
            e.stopPropagation();
            void handleSubmit(submit)(e);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="locationName">{label}</Label>
            <Input
              id="locationName"
              placeholder={placeholder}
              aria-invalid={!!errors.name}
              autoFocus
              {...register('name', { required: `${label} is required`, validate: (v) => !!v.trim() || `${label} is required` })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          {extra}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Saving...' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CityQuickCreateProps {
  open: boolean;
  /** The branch the city belongs to; when null the dialog asks for it. */
  branchId: string | null;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (cityName: string) => void;
}

/** Opened over the customer form; the new city is handed back so it can be selected at once. */
export function CityQuickCreateDialog({ open, branchId, initialName, onOpenChange, onCreated }: CityQuickCreateProps) {
  const { createCity, isCreatingCity } = useLocations(false);
  const picker = useBranchFieldValue(open && !branchId);
  return (
    <NameDialog
      open={open}
      title="Create City"
      label="City"
      placeholder="e.g., Kasur"
      initialName={initialName}
      isCreating={isCreatingCity}
      extra={!branchId && <BranchField field={picker.field} value={picker.value} onChange={picker.setValue} error={picker.error} id="cityBranch" />}
      onOpenChange={onOpenChange}
      onSubmit={async (name) => {
        if (!branchId && !picker.require()) throw new Error('Branch is required'); // keeps the dialog open
        const created = await createCity({ name, branchId: branchId || picker.value });
        onCreated(created.name);
      }}
    />
  );
}

interface CityChoice {
  id: string;
  name: string;
  branchId: string;
}

interface TerritoryQuickCreateProps {
  open: boolean;
  /** The city the territory goes in, when it is already known (the customer form). */
  city?: CityChoice | null;
  /** Otherwise the dialog asks which of these cities (the Supply reports dialog). */
  cityChoices?: CityChoice[];
  /** Pre-selected when asking, e.g. the one city already ticked. */
  defaultCityId?: string;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (territoryName: string) => void;
}

/** Creates a territory under a city: the given one, or one chosen in the dialog. */
export function TerritoryQuickCreateDialog({ open, city, cityChoices, defaultCityId, initialName, onOpenChange, onCreated }: TerritoryQuickCreateProps) {
  const { createTerritory, isCreatingTerritory } = useLocations(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setTouched(false);
    }
  }
  const asking = !city;
  const chosen = city ?? cityChoices?.find((c) => c.id === (picked ?? defaultCityId)) ?? null;

  return (
    <NameDialog
      open={open && (!!city || !!cityChoices)}
      title="Create Territory"
      description={chosen ? `In ${chosen.name}` : undefined}
      label="Territory"
      placeholder="e.g., Kangan Pur"
      initialName={initialName}
      isCreating={isCreatingTerritory}
      extra={
        asking && (
          <div className="space-y-1.5">
            <Label htmlFor="territoryCity">
              City <span className="text-destructive">*</span>
            </Label>
            <Select value={chosen?.id ?? ''} onValueChange={setPicked}>
              <SelectTrigger id="territoryCity" aria-label="City" aria-invalid={touched && !chosen}>
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                {(cityChoices ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && !chosen && <p className="text-xs text-destructive">City is required</p>}
          </div>
        )
      }
      onOpenChange={onOpenChange}
      onSubmit={async (name) => {
        if (!chosen) {
          setTouched(true);
          throw new Error('City is required'); // keeps the dialog open
        }
        const created = await createTerritory({ cityId: chosen.id, branchId: chosen.branchId, name });
        onCreated(created.name);
      }}
    />
  );
}
