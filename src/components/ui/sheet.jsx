import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export const SheetContent = React.forwardRef(function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}, ref) {
  const fullscreenContainer = typeof document === 'undefined' ? undefined : document.fullscreenElement || undefined;
  const sideClasses = {
    left: 'inset-y-0 left-0 h-full w-[min(23rem,92vw)] border-r data-[state=open]:animate-[sheet-left-in_220ms_cubic-bezier(0.215,0.61,0.355,1)] data-[state=closed]:animate-[sheet-left-out_180ms_cubic-bezier(0.215,0.61,0.355,1)]',
    right: 'inset-y-0 right-0 h-full w-[min(24rem,90vw)] border-l',
    bottom: 'inset-x-0 bottom-0 max-h-[82dvh] rounded-t-3xl border-t data-[state=open]:animate-[sheet-bottom-in_220ms_cubic-bezier(0.215,0.61,0.355,1)] data-[state=closed]:animate-[sheet-bottom-out_180ms_cubic-bezier(0.215,0.61,0.355,1)]',
  };

  return (
    <DialogPrimitive.Portal container={fullscreenContainer}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-black/65 backdrop-blur-sm data-[state=open]:animate-[sheet-overlay-in_220ms_cubic-bezier(0.215,0.61,0.355,1)] data-[state=closed]:animate-[sheet-overlay-out_180ms_cubic-bezier(0.215,0.61,0.355,1)]" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-[120] overflow-y-auto border-border bg-panel p-5 text-foreground shadow-2xl outline-none',
          sideClasses[side] || sideClasses.right,
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus" aria-label="Close panel">
          <X className="size-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export const SheetTitle = React.forwardRef(function SheetTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold', className)} {...props} />;
});

export const SheetDescription = React.forwardRef(function SheetDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});
