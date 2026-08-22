import React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-xl border border-border bg-white/[0.055] px-3.5 text-sm text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-subtle-foreground focus-visible:border-primary/40 focus-visible:bg-white/[0.075] focus-visible:ring-2 focus-visible:ring-focus/70 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
