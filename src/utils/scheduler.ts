import type { DayPlan, ProgressState, ScheduledTask, Topic } from '@/types';
import { topics } from '@/data/dsaRoadmap';
import { getProblemById, getProblemsByTopic } from '@/data/problems';
import { getVideosByTopic } from '@/data/videos';
import { computeTopicStats } from './analytics';
import { getDueRevisions } from './revision';

const REVISION_TASK_MIN = 15;
const MAX_REVISION_TASKS_WEEKDAY = 3;

// Topic-specific estimates (Easy / Medium / Hard), in minutes. Topics are
// keyed by the IDs present in this repository's roadmap data.
const TOPIC_MINUTES: Record<string, [number, number, number]> = {
  fundamentals: [15, 25, 40], sorting: [15, 25, 35], arrays: [15, 25, 40],
  hashing: [15, 25, 35], 'binary-search': [15, 30, 45], recursion: [25, 40, 60],
  'linked-list': [20, 30, 45], 'bit-manipulation': [20, 30, 45], greedy: [20, 35, 50],
  'sliding-window': [20, 35, 50], 'stack-queue': [20, 35, 50], 'binary-trees': [25, 40, 60],
  bst: [20, 35, 50], heaps: [20, 35, 50], graphs: [25, 45, 60], dp: [30, 50, 75],
  tries: [25, 40, 55], 'advanced-strings': [25, 40, 60], maths: [20, 35, 50],
};

export const estimateProblemMinutes = (problem: ReturnType<typeof getProblemById>): number => {
  if (!problem) return 30;
  if (Number.isFinite(problem.estimatedTime) && problem.estimatedTime >= 5 && problem.estimatedTime <= 120) return problem.estimatedTime;
  const band = TOPIC_MINUTES[problem.topicId];
  const idx = problem.difficulty === 'Easy' ? 0 : problem.difficulty === 'Hard' ? 2 : 1;
  return band?.[idx] ?? (idx === 0 ? 20 : idx === 2 ? 45 : 30);
};

const isSunday = (dateISO: string): boolean => {
  // Parse date components directly to avoid timezone issues with `new Date('YYYY-MM-DDT00:00:00')`
  const [year, month, day] = dateISO.split('-').map(Number);
  return new Date(year, month - 1, day).getDay() === 0;
};

/** Daily time budget in minutes, derived from weekly target / study days. Sundays skew toward a lighter revision/contest load. */
export const getDailyBudgetMinutes = (state: ProgressState, dateISO: string): number => {
  const { weeklyHoursTarget, studyDaysPerWeek } = state.preferences;
  const perDay = (weeklyHoursTarget * 60) / Math.max(1, studyDaysPerWeek);
  if (isSunday(dateISO)) return Math.round(perDay * 0.6);
  return Math.round(perDay);
};

/** Pre-sorted topics (immutable, computed once). */
const orderedTopics = [...topics].sort((a, b) => a.order - b.order);

/**
 * The topic the scheduler should actually pull tasks from: the user's
 * pinned `currentTopicId` unless it's already complete, in which case we
 * roll forward to the next incomplete topic in roadmap order.
 */
export const getEffectiveCurrentTopic = (state: ProgressState): Topic => {
  const pinned = orderedTopics.find((t) => t.id === state.currentTopicId);

  const isComplete = (t: Topic) => computeTopicStats(t, state).status === 'Completed';

  if (pinned && !isComplete(pinned)) return pinned;

  const startIdx = pinned ? orderedTopics.indexOf(pinned) : 0;
  for (let i = startIdx; i < orderedTopics.length; i++) {
    if (!isComplete(orderedTopics[i])) return orderedTopics[i];
  }
  // Everything complete — park on the final topic for revision-only days.
  return orderedTopics[orderedTopics.length - 1];
};

/**
 * Generate a deterministic task ID from date and context parameters.
 * The same logical task on the same day always gets the same ID.
 */
const makeTaskId = (dateISO: string, kind: string, refId: string): string =>
  `task-${dateISO}-${kind}-${refId}`;

export const generateDayPlan = (dateISO: string, state: ProgressState): DayPlan => {
  const dailyBudgetMin = state.plannerPreferences?.dailyBudgetMin ?? getDailyBudgetMinutes(state, dateISO);
  const tasks: ScheduledTask[] = [];
  let remaining = dailyBudgetMin;

  // ── 1. Revision due today (highest priority) ──────────────────────
  const due = getDueRevisions(state.problemProgress);
  const maxRevisions = isSunday(dateISO) ? due.length : Math.min(due.length, MAX_REVISION_TASKS_WEEKDAY);
  for (let i = 0; i < maxRevisions; i++) {
    if (remaining < REVISION_TASK_MIN) break;
    const problem = getProblemById(due[i].problemId);
    if (!problem) continue;
    tasks.push({
      id: makeTaskId(dateISO, 'revision', `${problem.id}-${due[i].entry.date}`),
      kind: 'revision',
      title: `Review: ${problem.title}`,
      subtitle: problem.subtopic,
      topicId: problem.topicId,
      topicTitle: orderedTopics.find((t) => t.id === problem.topicId)?.title,
      difficulty: problem.difficulty,
      estimatedMin: REVISION_TASK_MIN,
      refId: problem.id,
      url: problem.url,
      priorityLabel: 'Revision',
      priorityRank: 1,
    });
    remaining -= REVISION_TASK_MIN;
  }

  // ── 2. Current topic: next unwatched video ────────────────────────
  const preferredIds = state.plannerPreferences?.preferredTopicIds ?? [];
  const eligibleTopics = (preferredIds.length ? orderedTopics.filter((t) => preferredIds.includes(t.id)) : orderedTopics);
  const topic = eligibleTopics.sort((a, b) => {
    const aStats = computeTopicStats(a, state), bStats = computeTopicStats(b, state);
    return aStats.progressPct - bStats.progressPct || a.order - b.order;
  })[0] ?? getEffectiveCurrentTopic(state);
  const nextVideo = eligibleTopics.flatMap((candidate) => getVideosByTopic(candidate.id)
    .filter((v) => !state.videoProgress[v.id]?.watched).map((video) => ({ video, candidate })))
    .map((x) => x).find((x) => x.candidate.id === topic.id)?.video;

  if (nextVideo && nextVideo.durationMin <= remaining) {
    tasks.push({
      id: makeTaskId(dateISO, 'video', nextVideo.id),
      kind: 'video',
      title: `Watch: ${nextVideo.title}`,
      subtitle: nextVideo.creator,
      topicId: topic.id,
      topicTitle: topic.title,
      estimatedMin: nextVideo.durationMin,
      refId: nextVideo.id,
      url: nextVideo.url,
      priorityLabel: 'Continue Current Topic',
      priorityRank: 2,
    });
    remaining -= nextVideo.durationMin;
  }

  // ── 3. Current topic: unsolved problems, difficulty-ordered ───────
  const selectedTopics = eligibleTopics.length ? eligibleTopics : [topic];
  const selectedDifficulties = state.plannerPreferences?.difficultyPreference?.length ? state.plannerPreferences.difficultyPreference : ['Easy', 'Medium', 'Hard'];
  const unsolved = selectedTopics.flatMap((selectedTopic) => getProblemsByTopic(selectedTopic.id).map((p) => ({ ...p, selectedTopic }))).filter(({ id: problemId, difficulty }) => {
    const progress = state.problemProgress[problemId];
    return (difficulty === 'Unknown' || selectedDifficulties.includes(difficulty)) && (!progress || (progress.status !== 'Solved' && progress.status !== 'Mastered'));
  });

  const byDifficulty = [...unsolved].sort((a, b) => {
    const prefOrder = state.plannerPreferences?.difficultyPreference?.length ? state.plannerPreferences.difficultyPreference : state.preferences.difficultyPreference;
    const aIdx = prefOrder.indexOf(a.difficulty);
    const bIdx = prefOrder.indexOf(b.difficulty);
    // Fallback: treat missing difficulty as last
    const aOrder = aIdx === -1 ? prefOrder.length : aIdx;
    const bOrder = bIdx === -1 ? prefOrder.length : bIdx;
    return aOrder - bOrder || a.order - b.order;
  });

  for (const problem of byDifficulty) {
    if (remaining <= 0) break;
    // Never add a task that pushes the plan over its stated time budget.
    // Keep scanning because later problems may fit even when this one does not.
    const estimatedMin = estimateProblemMinutes(problem);
    if (estimatedMin > remaining) continue;
    const progress = state.problemProgress[problem.id];
    // A problem is a "retry" if it was previously attempted without being solved,
    // or if it was marked "Could not solve". These surface as priority work.
    const strugglingHere =
      ((progress?.attemptCount ?? 0) >= 1 && progress?.status !== 'Solved' && progress?.status !== 'Mastered') ||
      progress?.outcome === 'Could not solve';

    tasks.push({
      id: makeTaskId(dateISO, 'problem', problem.id),
      kind: 'problem',
      title: `Solve: ${problem.title}`,
      subtitle: problem.subtopic,
      topicId: problem.topicId,
      topicTitle: problem.selectedTopic.title,
      difficulty: problem.difficulty,
      estimatedMin,
      refId: problem.id,
      url: problem.url,
      priorityLabel: strugglingHere ? 'Retry — Previously Struggled' : 'New Problem',
      priorityRank: strugglingHere ? 2 : 3,
      reason: strugglingHere ? 'Prioritizes a problem you have attempted before.' : `Selected from ${problem.selectedTopic.title} to fit today's study time.`,
    });
    remaining -= estimatedMin;
  }

  // ── 4. Fallback: nothing left anywhere → pure revision/recap day ──
  if (tasks.length === 0) {
    tasks.push({
      id: makeTaskId(dateISO, 'review', topic.id),
      kind: 'review',
      title: '15-minute revision',
      subtitle: 'Skim notes on recently solved problems',
      topicId: topic.id,
      topicTitle: topic.title,
      estimatedMin: 15,
      refId: topic.id,
      priorityLabel: 'Review',
      priorityRank: 4,
    });
  }

  tasks.sort((a, b) => a.priorityRank - b.priorityRank);

  const totalEstimatedMin = tasks.reduce((sum, t) => sum + t.estimatedMin, 0);

  return { date: dateISO, tasks, totalEstimatedMin, dailyBudgetMin };
};
