import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { TopicStatus } from '@/types';





const topicStatusStyles: Record<TopicStatus, { dot: string; text: string }> = {
  'Not Started': { dot: 'bg-ink-faint', text: 'text-ink-muted' },
  'In Progress': { dot: 'bg-mint', text: 'text-mint' },
  Completed: { dot: 'bg-signal', text: 'text-signal' },
};

export function TopicStatusBadge({ status }: { status: TopicStatus }) {
  const s = topicStatusStyles[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', s.text)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {status}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-ink-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}
