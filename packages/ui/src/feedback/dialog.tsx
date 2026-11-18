'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '../lib/cn';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-40 bg-black/50',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Adds a button that toggles the dialog between its normal size and full screen. */
  expandable?: boolean;
}

// Pressing these never starts a drag, so fields stay editable and clickable.
const NO_DRAG_SELECTOR =
  'input, textarea, select, button, a, label, [role="combobox"], [role="option"], [contenteditable="true"]';

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, expandable, style, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...props }, ref) => {
    // Lives with the content, so it resets to normal size and centered every time the dialog reopens.
    const [expanded, setExpanded] = React.useState(false);
    const [offset, setOffset] = React.useState({ x: 0, y: 0 });
    const [dragging, setDragging] = React.useState(false);
    const drag = React.useRef<{
      pointerX: number;
      pointerY: number;
      start: { x: number; y: number };
      rect: DOMRect;
    } | null>(null);

    const endDrag = () => {
      drag.current = null;
      setDragging(false);
    };
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg border border-border bg-background p-6 shadow-lg outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            className,
            expanded && 'h-screen max-h-screen w-screen max-w-none rounded-none',
            !expanded && (dragging ? 'cursor-grabbing select-none' : 'cursor-grab'),
          )}
          // Offsets left/top rather than transform, which the centering and open animation already use.
          style={expanded ? style : { ...style, left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` }}
          onPointerDown={(e) => {
            onPointerDown?.(e);
            if (e.defaultPrevented || expanded || e.button !== 0) return;
            // React events bubble out of portals (e.g. an open Select list), which must not drag the dialog.
            if (!e.currentTarget.contains(e.target as Node)) return;
            if ((e.target as HTMLElement).closest(NO_DRAG_SELECTOR)) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              pointerX: e.clientX,
              pointerY: e.clientY,
              start: offset,
              rect: e.currentTarget.getBoundingClientRect(),
            };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            onPointerMove?.(e);
            const d = drag.current;
            if (!d) return;
            // Keep the whole dialog inside the window so its title bar is always reachable.
            const dx = Math.min(Math.max(e.clientX - d.pointerX, -d.rect.left), Math.max(0, window.innerWidth - d.rect.right));
            const dy = Math.min(Math.max(e.clientY - d.pointerY, -d.rect.top), Math.max(0, window.innerHeight - d.rect.bottom));
            setOffset({ x: d.start.x + dx, y: d.start.y + dy });
          }}
          onPointerUp={(e) => {
            onPointerUp?.(e);
            endDrag();
          }}
          onPointerCancel={(e) => {
            onPointerCancel?.(e);
            endDrag();
          }}
          {...props}
        >
          {children}
          {expandable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="absolute right-11 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={expanded ? 'Exit full screen' : 'Full screen'}
              title={expanded ? 'Exit full screen' : 'Full screen'}
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
