import type { ProgressState, Topic, TopicStats, TopicStatus, WeakTopic } from '@/types';
import { topics } from '@/data/dsaRoadmap';
import { getProblemsByTopic } from '@/data/problems';
import { getVideosByTopic } from '@/data/videos';
import { countPendingRevisions } from './revision';
import { lastNDays } from './date';

const MASTERY_THRESHOLD = 0.9; // topic counts "Completed" once 90% of problems are solved/mastered

export const computeTopicStats = (topic: Topic, state: ProgressState): TopicStats => {
  const videos = getVideosByTopic(topic.id);
  const problems = getProblemsByTopic(topic.id);

  const watchedVideos = videos.filter((v) => state.videoProgress[v.id]?.watched).length;

  let solvedProblems = 0;
  let masteredProblems = 0;
  let revisionDue = 0;

  for (const p of problems) {
    const progress = state.problemProgress[p.id];
    if (progress) {
      if (progress.status === 'Solved' || progress.status === 'Mastered') {
        solvedProblems += 1;
      }
      if (progress.status === 'Mastered') masteredProblems += 1;
      revisionDue += countPendingRevisions(progress);
    }
  }

  const totalUnits = videos.length + problems.length;
  const doneUnits = watchedVideos + solvedProblems;
  const progressPct = totalUnits === 0 ? 0 : Math.round((doneUnits / totalUnits) * 100);

  const remainingProblems = problems.length - solvedProblems;
  const solvedFrac = problems.length === 0 ? 0 : solvedProblems / problems.length;

  let status: TopicStatus = 'Not Started';
  if (state.completedTopicIds.includes(topic.id) || solvedFrac >= MASTERY_THRESHOLD) {
    status = 'Completed';
  } else if (doneUnits > 0) {
    status = 'In Progress';
  }

  const estimatedHoursRemaining =
    totalUnits === 0 ? 0 : Math.max(0, topic.estimatedHours * (1 - doneUnits / totalUnits));

  return {
    topic,
    totalVideos: videos.length,
    watchedVideos,
    totalProblems: problems.length,
    solvedProblems,
    masteredProblems,
    remainingProblems,
    revisionDue,
    progressPct,
    status,
    estimatedHoursRemaining: Math.round(estimatedHoursRemaining * 10) / 10,
  };
};

export const computeAllTopicStats = (state: ProgressState): TopicStats[] =>
  topics.map((t) => computeTopicStats(t, state));

/**
 * Weak topics: topics with a meaningful attempt count but a low solve rate,
 * or with problems repeatedly marked "Needs Revision" / "Forgot" on review.
 */
export const computeWeakTopics = (state: ProgressState, limit = 3): WeakTopic[] => {
  const scored: WeakTopic[] = [];

  for (const topic of topics) {
    const problems = getProblemsByTopic(topic.id);
    if (problems.length === 0) continue;

    let attempted = 0;
    let struggling = 0;
    let forgotCount = 0;

    for (const p of problems) {
      const progress = state.problemProgress[p.id];
      if (!progress) continue;
      if (progress.attemptCount > 0) attempted += 1;
      // Each problem contributes at most once to struggling count
      const isStruggling =
        progress.status === 'Needs Revision' ||
        progress.outcome === 'Could not solve' ||
        progress.outcome === 'Needed solution';
      if (isStruggling) struggling += 1;
      forgotCount += progress.revisionSchedule.filter((r) => r.rating === 'Forgot').length;
    }

    if (attempted === 0) continue;

    const struggleRate = Math.min(1, struggling / attempted);
    const score = struggleRate * 100 + forgotCount * 15;

    if (score <= 5) continue;

    const reasons: string[] = [];
    if (struggling > 0) reasons.push(`${struggling} problem${struggling === 1 ? '' : 's'} needing revision`);
    if (forgotCount > 0) reasons.push(`forgotten on review ${forgotCount} time${forgotCount === 1 ? '' : 's'}`);

    scored.push({ topicId: topic.id, topicTitle: topic.title, score: Math.round(score), reasons });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
};

export interface WeeklyProgressPoint {
  date: string;
  minutes: number;
  targetMinutes: number;
}

export interface OverallStats {
  totalProblems: number;
  solvedProblems: number;
  totalVideos: number;
  watchedVideos: number;
  topicsCompleted: number;
  totalTopics: number;
  weekMinutes: number;
  weeklyTargetMinutes: number;
}

export const computeWeekMinutesSoFar = (state: ProgressState): number => {
  const days = lastNDays(7);
  return days.reduce((sum, d) => sum + (state.dailyActivity[d]?.studyMin ?? 0), 0);
};

export const computeOverallStats = (state: ProgressState, precomputedStats?: TopicStats[]): OverallStats => {
  const allStats = precomputedStats ?? computeAllTopicStats(state);
  return {
    totalProblems: allStats.reduce((s, t) => s + t.totalProblems, 0),
    solvedProblems: allStats.reduce((s, t) => s + t.solvedProblems, 0),
    totalVideos: allStats.reduce((s, t) => s + t.totalVideos, 0),
    watchedVideos: allStats.reduce((s, t) => s + t.watchedVideos, 0),
    topicsCompleted: allStats.filter((t) => t.status === 'Completed').length,
    totalTopics: allStats.length,
    weekMinutes: computeWeekMinutesSoFar(state),
    weeklyTargetMinutes: state.preferences.weeklyHoursTarget * 60,
  };
};
