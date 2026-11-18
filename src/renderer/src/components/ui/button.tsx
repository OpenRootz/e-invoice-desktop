import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary-hover',
        destructive: 'border border-destructive bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background font-medium hover:bg-muted',
        ghost: 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'min-h-11 px-[18px]',
        sm: 'min-h-9 px-3',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />;
}
