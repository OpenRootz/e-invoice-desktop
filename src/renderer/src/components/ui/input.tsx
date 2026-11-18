import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-[#5a6760] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50 aria-invalid:border-warning-border aria-invalid:shadow-[inset_0_0_0_1px_var(--color-warning-border)]';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(field, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(field, 'min-h-20 py-2.5', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(field, 'h-11', className)} {...props} />;
}
