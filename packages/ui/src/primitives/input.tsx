import * as React from 'react';
import { cn } from '../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Whole numbers only (quantities, counts): no decimal point, exponent or sign can be typed or pasted. */
  integer?: boolean;
}

const BLOCKED_INTEGER_KEYS = new Set(['.', ',', 'e', 'E', '+', '-']);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, integer, onWheel, onKeyDown, onPaste, step, ...props }, ref) => {
    const isNumber = type === 'number';
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          isNumber &&
            '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none',
          className,
        )}
        ref={ref}
        step={integer ? (step ?? 1) : step}
        inputMode={integer ? 'numeric' : props.inputMode}
        // Scrolling over a focused number box must not change its value: leave the box instead.
        onWheel={
          isNumber
            ? (e) => {
                e.currentTarget.blur();
                onWheel?.(e);
              }
            : onWheel
        }
        onKeyDown={
          integer
            ? (e) => {
                if (BLOCKED_INTEGER_KEYS.has(e.key)) e.preventDefault();
                onKeyDown?.(e);
              }
            : onKeyDown
        }
        onPaste={
          integer
            ? (e) => {
                if (!/^\d*$/.test(e.clipboardData.getData('text').trim())) e.preventDefault();
                onPaste?.(e);
              }
            : onPaste
        }
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
