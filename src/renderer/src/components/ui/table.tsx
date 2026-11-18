import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}
export const Th = ({ className, ...props }: ComponentProps<'th'>) => (
  <th className={cn('bg-muted px-3 py-2 text-left font-medium text-muted-foreground', className)} {...props} />
);
export const Td = ({ className, ...props }: ComponentProps<'td'>) => (
  <td className={cn('border-t border-border px-3 py-2', className)} {...props} />
);
