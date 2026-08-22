import React from 'react';
import { cn } from '../../lib/utils';

export const Textarea = React.forwardRef(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-11 w-full rounded-xl border border-border bg-white/[0.055] px-3.5 py-3 text-sm text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-subtle-foreground focus-visible:border-primary/40 focus-visible:bg-white/[0.075] focus-visible:ring-2 focus-visible:ring-focus/70 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
