'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open = false, onOpenChange, children }) => {
  console.log('Dialog component rendering, open:', open);
  if (!open) return null;
  console.log('Dialog is rendering children');
  return <>{children}</>;
};
Dialog.displayName = 'Dialog';

const DialogTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => <button ref={ref} {...props} />
);
DialogTrigger.displayName = 'DialogTrigger';

const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
DialogPortal.displayName = 'DialogPortal';

const DialogClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => <button ref={ref} {...props} />
);
DialogClose.displayName = 'DialogClose';

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onClick, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-black/50', className)}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClick) {
          onClick(e);
        }
      }}
      {...props}
    />
  )
);
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }>(
  ({ className, children, onClose, ...props }, ref) => {
    console.log('DialogContent rendering');
    return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" />
      <div
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
        <button
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </>
    );
  }
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-gray-500 dark:text-gray-400', className)} {...props} />
  )
);
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
