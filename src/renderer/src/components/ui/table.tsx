import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-background">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}
export const Th = ({ className, ...props }: ComponentProps<'th'>) => (
  <th className={cn('px-4 pt-3.5 pb-2.5 text-left text-xs font-medium text-muted-foreground', className)} {...props} />
);
export const Td = ({ className, ...props }: ComponentProps<'td'>) => (
  <td className={cn('border-t border-border px-4 py-2', className)} {...props} />
);
