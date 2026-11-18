import { CircleAlert } from 'lucide-react';
import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** A labelled form field; passes `id` and `aria-invalid` to its single input child. */
export function Field({
  label,
  error,
  warning,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  warning?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const messageId = `${id}-msg`;
  const message = error ?? warning;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id, 'aria-invalid': !!error || undefined, 'aria-describedby': message || hint ? messageId : undefined })}
      {message ? (
        // Never colour alone: an icon and the text name the problem
        <p id={messageId} className="flex items-start gap-1.5 text-xs leading-snug font-medium text-warning">
          <CircleAlert className="mt-px size-[13px] shrink-0" strokeWidth={2.2} />
          {message}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-[12.5px] leading-normal text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[cols];
  return <div className={cn('grid grid-cols-1 gap-x-5 gap-y-[18px]', grid)}>{children}</div>;
}
