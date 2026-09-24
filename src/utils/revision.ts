import type { ProblemProgress, RevisionEntry } from '@/types';
import { addDaysISO, isPastOrToday, todayISO } from './date';

/**
 * Build a fresh revision schedule for a problem that was just solved,
 * based on the configured intervals (default [1, 7, 30] days out).
 */
export const buildRevisionSchedule = (
  solvedDateISO: string,
  intervals: number[],
): RevisionEntry[] => intervals.map((days) => ({ date: addDaysISO(solvedDateISO, days), done: false }));

/** All revision entries across all problems that are due today or overdue. */
export const getDueRevisions = (
  problemProgress: Record<string, ProblemProgress>,
): { problemId: string; entry: RevisionEntry }[] => {
  const due: { problemId: string; entry: RevisionEntry }[] = [];
  for (const progress of Object.values(problemProgress)) {
    for (const entry of progress.revisionSchedule) {
      if (!entry.done && isPastOrToday(entry.date)) {
        due.push({ problemId: progress.problemId, entry });
      }
    }
  }
  // Most-overdue first
  due.sort((a, b) => (a.entry.date < b.entry.date ? -1 : 1));
  return due;
};

/** Count of not-yet-done revision entries scheduled for a specific problem. */
export const countPendingRevisions = (progress: ProblemProgress | undefined): number =>
  progress ? progress.revisionSchedule.filter((r) => !r.done).length : 0;

/** Mark the earliest pending (due) revision entry for a problem as complete. */
export const completeNextRevision = (
  progress: ProblemProgress,
  rating: ProblemProgress['revisionSchedule'][number]['rating'],
): ProblemProgress => {
  const idx = progress.revisionSchedule.findIndex((r) => !r.done && isPastOrToday(r.date));
  if (idx === -1) return progress;
  const nextSchedule = [...progress.revisionSchedule];
  nextSchedule[idx] = { ...nextSchedule[idx], done: true, rating };

  // "Forgot" -> re-inject a follow-up revision a week out so weak spots resurface.
  if (rating === 'Forgot') {
    nextSchedule.push({ date: addDaysISO(todayISO(), 7), done: false });
  }

  return {
    ...progress,
    revisionSchedule: nextSchedule,
    status: rating === 'Forgot' ? 'Needs Revision' : progress.status,
  };
};
