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
        'border-border text-foreground placeholder:text-subtle-foreground focus-visible:border-primary/40 focus-visible:ring-focus/70 flex h-11 w-full rounded-xl border bg-white/[0.055] px-3.5 text-sm transition-[border-color,background-color,box-shadow] duration-200 outline-none focus-visible:bg-white/[0.075] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
