'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@medicore/ui';

interface FullReturnConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentNumber: string;
  isPending: boolean;
  onConfirm: () => void;
}

export function FullReturnConfirm({ open, onOpenChange, documentNumber, isPending, onConfirm }: FullReturnConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Full return</DialogTitle>
          <DialogDescription>
            Are you sure you want to make a full return of {documentNumber}? All remaining items will be returned.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Returning...' : 'Yes, full return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
