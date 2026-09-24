import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import type { Difficulty, ProblemStatus, TopicStatus } from '@/types';

const difficultyStyles: Record<Difficulty, string> = {
  Easy: 'bg-easy/10 text-easy border-easy/20',
  Medium: 'bg-medium/10 text-medium border-medium/20',
  Hard: 'bg-hard/10 text-hard border-hard/20',
  Unknown: 'bg-surface-hover text-ink-muted border-border',
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium',
        difficultyStyles[difficulty],
      )}
    >
      {difficulty}
    </span>
  );
}

const problemStatusStyles: Record<ProblemStatus, string> = {
  'Not Started': 'bg-surface-hover text-ink-muted border-border',
  Attempted: 'bg-amber/10 text-amber border-amber/20',
  Solved: 'bg-mint/10 text-mint border-mint/20',
  'Needs Revision': 'bg-coral/10 text-coral border-coral/20',
  Mastered: 'bg-signal/10 text-signal border-signal/20',
};

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        problemStatusStyles[status],
      )}
    >
      {status}
    </span>
  );
}

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
