import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-lg border border-border bg-background p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('mb-4 text-base font-semibold', className)} {...props} />;
}
