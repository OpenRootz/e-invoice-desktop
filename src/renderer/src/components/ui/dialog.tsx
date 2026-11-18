import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(23,32,27,0.5)]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-8 left-1/2 z-50 flex max-h-[calc(100vh-4rem)] w-[min(720px,calc(100vw-48px))] -translate-x-1/2 flex-col rounded-2xl bg-background shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
        >
          <div className="flex items-center justify-between border-b border-border py-2 pr-3 pl-6">
            <DialogPrimitive.Title className="font-heading text-[19px] font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-6 py-[22px]">{children}</div>
          {footer && <div className="flex justify-end gap-3 border-t border-border px-6 py-4">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
