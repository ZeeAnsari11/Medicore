'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@medicore/ui';

interface CategoryNameDialogProps {
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  /** Prefilled name: the typed search term when creating, the current name when renaming. */
  initialName?: string;
  /** Renaming: the submit button stays disabled until the name actually changes. */
  rename?: boolean;
  submitLabel: string;
  /** Resolve to close the dialog; reject (the hook already shows the error toast) to keep it open. */
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
  /** Extra field(s) shown under the name, e.g. the branch of a new category. */
  extra?: React.ReactNode;
  /** False keeps Create disabled until the extra field is filled in. */
  extraReady?: boolean;
}

/** One-field dialog for naming a main category or sub-category (create or rename). Mount it only while open. */
export function CategoryNameDialog({
  title,
  description,
  label,
  placeholder,
  initialName = '',
  rename = false,
  submitLabel,
  onSubmit,
  onClose,
  extra,
  extraReady = true,
}: CategoryNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const canSubmit =
    trimmed.length >= 2 && (!rename || trimmed !== initialName.trim()) && extraReady && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="category-name">{label}</Label>
            <Input
              id="category-name"
              autoFocus
              value={name}
              placeholder={placeholder}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {extra}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? 'Saving...' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
