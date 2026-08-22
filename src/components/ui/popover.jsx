import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef(function PopoverContent(
  { className, align = 'center', sideOffset = 10, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'motion-popover z-50 max-h-[min(34rem,calc(100dvh-7rem))] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-2xl border border-border bg-panel/97 p-3.5 text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.55)] outline-none backdrop-blur-2xl motion-reduce:animate-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
