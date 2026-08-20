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
        'flex min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.055] px-3.5 py-3 text-sm text-zinc-100 outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-zinc-600 focus-visible:border-teal-300/40 focus-visible:bg-white/[0.075] focus-visible:ring-2 focus-visible:ring-teal-300/70 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
