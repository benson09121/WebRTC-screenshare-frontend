import React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-panel/90 p-1 shadow-[0_12px_35px_rgba(0,0,0,0.32)] backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:bg-white/[0.1] data-[state=active]:text-foreground data-[state=active]:shadow-sm disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
});
