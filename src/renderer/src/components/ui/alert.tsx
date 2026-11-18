import { AlertTriangle, CircleX, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

const styles = {
  error: { box: 'border-destructive/40 bg-destructive/5 text-destructive', Icon: CircleX },
  warning: { box: 'border-warning/40 bg-warning/5 text-warning', Icon: AlertTriangle },
  info: { box: 'border-primary/30 bg-primary/5 text-primary', Icon: Info },
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
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-md border p-3 text-sm', box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-foreground">{children}</div>}
      </div>
    </div>
  );
}
