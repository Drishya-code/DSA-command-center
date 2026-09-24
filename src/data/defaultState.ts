import type { ProgressState, UserPreferences } from '@/types';
import { topics } from './dsaRoadmap';

export const SCHEMA_VERSION = 2;

export const defaultPreferences: UserPreferences = {
  onboarded: false,
  name: '',
  weeklyHoursTarget: 11,
  studyDaysPerWeek: 6,
  preferredStudyTime: 'Evening',
  currentLevel: 'Beginner-Intermediate',
  difficultyPreference: ['Easy', 'Medium', 'Hard'],
  theme: 'dark',
  revisionIntervals: [1, 7, 30],
  minMinutesForStreak: 30,
};

export const createDefaultState = (): ProgressState => ({
  preferences: { ...defaultPreferences },
  videoProgress: {},
  problemProgress: {},
  mistakes: [],
  sessions: [],
  dailyActivity: {},
  streak: { current: 0, longest: 0 },
  completedTopicIds: [],
  currentTopicId: topics[0]?.id ?? null,
  taskCompletionsToday: {},
  schemaVersion: SCHEMA_VERSION,
});

export const PROGRESS_STORAGE_KEY = 'dsa-tracker:progress:v2';

/**
 * Sanitize a preferences patch coming from user input or imported data.
 * Clamps numeric fields to sane ranges and repairs invalid values so a
 * mid-edit field (empty string, NaN, 11402) can never poison the scheduler.
 */
export const sanitizePreferences = (prefs: Partial<UserPreferences>): Partial<UserPreferences> => {
  const out: Partial<UserPreferences> = { ...prefs };
  const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  if ('weeklyHoursTarget' in prefs) out.weeklyHoursTarget = clamp(prefs.weeklyHoursTarget, 1, 60, defaultPreferences.weeklyHoursTarget);
  if ('studyDaysPerWeek' in prefs) out.studyDaysPerWeek = clamp(prefs.studyDaysPerWeek, 1, 7, defaultPreferences.studyDaysPerWeek);
  if ('minMinutesForStreak' in prefs) out.minMinutesForStreak = clamp(prefs.minMinutesForStreak, 5, 480, defaultPreferences.minMinutesForStreak);
  if (Array.isArray(prefs.revisionIntervals)) {
    const ints = prefs.revisionIntervals
      .map((d) => (typeof d === 'number' && Number.isFinite(d) && d > 0 ? Math.round(d) : 0))
      .filter((d) => d > 0)
      .slice(0, 6);
    out.revisionIntervals = ints.length ? ints : [...defaultPreferences.revisionIntervals];
  }
  return out;
};
