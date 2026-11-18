import { AlertTriangle, CircleCheck, CircleX } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const styles = {
  error: { box: 'bg-warning-soft text-warning', Icon: CircleX },
  warning: { box: 'bg-warning-soft text-warning', Icon: AlertTriangle },
  info: { box: 'bg-success-soft text-success', Icon: CircleCheck },
};

export function Alert({
  kind = 'info',
  title,
  children,
  className,
}: {
  kind?: keyof typeof styles;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = styles[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl px-4 py-3.5 text-sm leading-snug', box, className)}
    >
      <Icon className="size-5 shrink-0" strokeWidth={1.75} />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-foreground">{children}</div>}
      </div>
    </div>
  );
}
