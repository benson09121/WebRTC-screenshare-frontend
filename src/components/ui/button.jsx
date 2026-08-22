import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[color,background-color,border-color,transform,opacity] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98] motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border border-border bg-white/[0.07] text-foreground hover:bg-white/[0.12]',
        ghost: 'text-muted-foreground hover:bg-white/[0.08] hover:text-foreground',
        destructive: 'bg-danger/90 text-white hover:bg-danger/80',
        active: 'border border-primary/30 bg-primary/15 text-primary hover:bg-primary/20',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-12 px-6',
        icon: 'size-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export const Button = React.forwardRef(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
