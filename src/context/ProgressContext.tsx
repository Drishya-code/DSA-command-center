import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {
  MistakeLogEntry,
  MistakeType,
  OutcomeType,
  ProblemProgress,
  ProblemStatus,
  ProgressState,
  RevisionRating,
  StudySession,
  UserPreferences,
} from '@/types';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { createDefaultState, sanitizePreferences, PROGRESS_STORAGE_KEY } from '@/data/defaultState';
import { getProblemById } from '@/data/problems';
import { todayISO, addDaysISO } from '@/utils/date';
import { buildRevisionSchedule, completeNextRevision } from '@/utils/revision';
import { computeAllTopicStats } from '@/utils/analytics';
import { sanitizeUrl, hasNoPrototypeKeys } from '@/utils/sanitize';

interface ProgressContextValue {
  state: ProgressState;
  setState: Dispatch<SetStateAction<ProgressState>>;

  // preferences / onboarding
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  completeOnboarding: (patch: Partial<UserPreferences> & { currentTopicId?: string }) => void;

  // videos
  markVideoWatched: (videoId: string, watched: boolean) => void;
  setVideoNotes: (videoId: string, notes: string) => void;

  // problems
  setProblemStatus: (problemId: string, status: ProblemStatus) => void;
  toggleProblemSolved: (problemId: string) => void;
  recordAttempt: (problemId: string) => void;
  undoLastAttempt: (problemId: string) => void;
  solveProblem: (problemId: string, outcome: OutcomeType, notes?: string) => void;
  setProblemNotes: (problemId: string, notes: string) => void;
  rateRevision: (problemId: string, rating: RevisionRating) => void;

  // mistakes
  logMistake: (problemId: string, type: MistakeType, note?: string) => void;

  // time / sessions / streak
  logStudyMinutes: (minutes: number, opts?: { topicId?: string; problemIds?: string[]; videoIds?: string[] }) => void;
  addSession: (session: Omit<StudySession, 'id'>) => void;

  // tasks
  completeTaskToday: (taskId: string) => void;
  isTaskCompletedToday: (taskId: string) => boolean;

  // topic navigation
  setCurrentTopic: (topicId: string) => void;
  markTopicCompleted: (topicId: string) => void;

  // data management
  exportData: () => string;
  importData: (json: string) => { ok: boolean; error?: string };
  resetProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

const LEGACY_PROBLEM_ID_MAP: Record<string, string> = {
  "p4": "a2z-374",
  "p8": "a2z-365",
  "p9": "a2z-947",
  "p10": "a2z-943",
  "p16": "a2z-37",
  "p17": "a2z-301",
  "p24": "a2z-911",
  "p26": "a2z-31",
  "p28": "a2z-712",
  "p31": "a2z-21",
  "p32": "a2z-20",
  "p34": "a2z-23",
  "p36": "a2z-27",
  "p37": "a2z-28",
  "p40": "a2z-965",
  "p43": "a2z-89",
  "p46": "a2z-83",
  "p48": "a2z-88",
  "p50": "a2z-600",
  "p51": "a2z-73",
  "p54": "a2z-79",
  "p57": "a2z-400",
  "p59": "a2z-929",
  "p64": "a2z-982",
  "p65": "a2z-395",
  "p71": "a2z-613",
  "p85": "a2z-868",
  "p86": "a2z-864",
  "p87": "a2z-865",
  "p91": "a2z-873",
  "p92": "a2z-871",
  "p94": "a2z-874",
  "p95": "a2z-876",
  "p96": "a2z-878",
  "p97": "a2z-869",
  "p99": "a2z-144",
  "p100": "a2z-145",
  "p116": "a2z-961",
  "p117": "a2z-960",
  "p119": "a2z-967",
  "p121": "a2z-964",
  "p122": "a2z-971",
  "p124": "a2z-931",
  "p125": "a2z-927",
  "p126": "a2z-926",
  "p128": "a2z-930",
  "p129": "a2z-988",
  "p130": "a2z-963",
  "p131": "a2z-578",
  "p139": "a2z-541",
  "p141": "a2z-595",
  "p143": "a2z-544",
  "p144": "a2z-546",
  "p145": "a2z-550",
  "p148": "a2z-547",
  "p149": "a2z-549",
  "p150": "a2z-489",
  "p161": "a2z-130",
  "p182": "a2z-98",
  "p183": "a2z-534",
  "p186": "a2z-505",
  "p192": "a2z-535",
  "p193": "a2z-536",
  "p197": "a2z-518",
  "p198": "a2z-522",
  "p201": "a2z-514",
  "p205": "a2z-503",
  "p206": "a2z-290",
  "p207": "a2z-287",
  "p209": "a2z-308",
  "p210": "a2z-636",
  "p212": "a2z-307",
  "p215": "a2z-321",
  "p217": "a2z-310",
  "p218": "a2z-327",
  "p219": "a2z-329",
  "p220": "a2z-303",
  "p221": "a2z-304",
  "p223": "a2z-306",
  "p224": "a2z-322",
  "p226": "a2z-314",
  "p231": "a2z-1024",
  "p233": "a2z-980",
  "p235": "a2z-981",
  "p237": "a2z-979",
  "p239": "a2z-877",
  "p243": "a2z-652"
};

function getOrCreateProblemProgress(state: ProgressState, problemId: string): ProblemProgress {
  return (
    state.problemProgress[problemId] ?? {
      problemId,
      status: 'Not Started',
      attemptCount: 0,
      revisionSchedule: [],
      timeSpentMin: 0,
    }
  );
}

/**
 * Migrate and repair loaded state to ensure all required fields exist,
 * duplicates are removed, and stale data is cleaned up.
 * This runs once on mount and on import.
 */
function migrateState(raw: ProgressState): ProgressState {
  // Reject prototype pollution attempts in imported data
  if (!hasNoPrototypeKeys(raw)) {
    console.warn('[DSA Tracker] Rejected state with prototype pollution keys');
    return createDefaultState();
  }

  const defaults = createDefaultState();
  const today = todayISO();
  const cutoff = addDaysISO(today, -30); // keep last 30 days of taskCompletions

  // 1. Ensure all top-level fields exist with correct types
  const state: ProgressState = {
    ...defaults,
    ...raw,
    preferences: sanitizePreferences({ ...defaults.preferences, ...(raw.preferences ?? {}) }) as ProgressState['preferences'],
    problemProgress: raw.problemProgress ?? {},
    videoProgress: raw.videoProgress ?? {},
    mistakes: Array.isArray(raw.mistakes) ? raw.mistakes : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    dailyActivity: raw.dailyActivity ?? {},
    streak: {
      current: typeof raw.streak?.current === 'number' ? raw.streak.current : 0,
      longest: typeof raw.streak?.longest === 'number' ? raw.streak.longest : 0,
      lastActiveDate: raw.streak?.lastActiveDate,
    },
    completedTopicIds: Array.isArray(raw.completedTopicIds) ? raw.completedTopicIds : [],
    currentTopicId: raw.currentTopicId ?? defaults.currentTopicId,
    taskCompletionsToday: raw.taskCompletionsToday ?? {},
    dailyPlans: Object.fromEntries(Object.entries(raw.dailyPlans && typeof raw.dailyPlans === 'object' ? raw.dailyPlans : {})
      .filter(([date, plan]) => date >= cutoff && plan && typeof plan === 'object' && Array.isArray((plan as any).tasks))
      .map(([date, plan]) => [date, { ...(plan as any), date }])),
    plannerPreferences: {
      dailyBudgetMin: Math.min(480, Math.max(15, Number(raw.plannerPreferences?.dailyBudgetMin) || 60)),
      preferredTopicIds: Array.isArray(raw.plannerPreferences?.preferredTopicIds) ? raw.plannerPreferences.preferredTopicIds.filter((id) => typeof id === 'string') : [],
      difficultyPreference: Array.isArray(raw.plannerPreferences?.difficultyPreference) ? raw.plannerPreferences.difficultyPreference.filter((value) => ['Easy', 'Medium', 'Hard'].includes(value)) : ['Easy', 'Medium', 'Hard'],
    },
    schemaVersion: defaults.schemaVersion,
  };

  // 2. Deduplicate completedTopicIds
  state.completedTopicIds = [...new Set(state.completedTopicIds)];

  // 3. Clean up old taskCompletionsToday entries (keep last 30 days)
  const cleanedTasks: Record<string, string[]> = {};
  for (const [date, taskIds] of Object.entries(state.taskCompletionsToday)) {
    if (date >= cutoff && Array.isArray(taskIds)) {
      cleanedTasks[date] = [...new Set(taskIds)]; // also deduplicate task IDs
    }
  }
  state.taskCompletionsToday = cleanedTasks;

  // 4. Migrate legacy p1..p244 problem IDs into stable a2z-* IDs where titles matched.
  const migratedProblemProgress: Record<string, ProblemProgress> = {};
  for (const [id, value] of Object.entries(state.problemProgress)) {
    const nextId = LEGACY_PROBLEM_ID_MAP[id] ?? id;
    const existing = migratedProblemProgress[nextId];
    if (!existing) {
      migratedProblemProgress[nextId] = { ...value, problemId: nextId };
    } else {
      // Preserve the richer progress record if both legacy/new IDs exist.
      migratedProblemProgress[nextId] = {
        ...existing,
        ...value,
        problemId: nextId,
        attemptCount: Math.max(existing.attemptCount ?? 0, value.attemptCount ?? 0),
        timeSpentMin: Math.max(existing.timeSpentMin ?? 0, value.timeSpentMin ?? 0),
      };
    }
  }
  state.problemProgress = migratedProblemProgress;

  // 5. Validate and repair problemProgress entries
  const validStatuses = new Set(['Not Started', 'Attempted', 'Solved', 'Needs Revision', 'Mastered']);
  const repairedProgress: Record<string, ProblemProgress> = {};
  for (const [id, progress] of Object.entries(state.problemProgress)) {
    if (!progress || typeof progress !== 'object') continue;
    repairedProgress[id] = {
      problemId: id,
      status: validStatuses.has(progress.status) ? progress.status : 'Not Started',
      attemptCount: typeof progress.attemptCount === 'number' ? Math.max(0, progress.attemptCount) : 0,
      revisionSchedule: Array.isArray(progress.revisionSchedule) ? progress.revisionSchedule : [],
      timeSpentMin: typeof progress.timeSpentMin === 'number' ? Math.max(0, progress.timeSpentMin) : 0,
      outcome: progress.outcome,
      lastAttempted: progress.lastAttempted,
      lastSolved: progress.lastSolved,
      completedAt: typeof progress.completedAt === 'string' ? progress.completedAt : undefined,
      attemptUndo: progress.attemptUndo && typeof progress.attemptUndo.attemptedAt === 'string'
        && typeof progress.attemptUndo.previousCount === 'number'
        && validStatuses.has(progress.attemptUndo.previousStatus)
        ? progress.attemptUndo : undefined,
      notes: progress.notes,
    };
  }
  state.problemProgress = repairedProgress;

  // 6. Validate and repair videoProgress entries
  const repairedVideo: Record<string, import('@/types').VideoProgress> = {};
  for (const [id, progress] of Object.entries(state.videoProgress)) {
    if (!progress || typeof progress !== 'object') continue;
    repairedVideo[id] = {
      videoId: id,
      watched: progress.watched === true,
      dateWatched: progress.dateWatched,
      notes: progress.notes,
    };
  }
  state.videoProgress = repairedVideo;

  // 7. Sanitize any URL fields in preferences (defense-in-depth)
  if (state.preferences) {
    // preferences shouldn't contain URLs, but sanitize if imported data injected them
    for (const key of Object.keys(state.preferences)) {
      const prefs = state.preferences as unknown as Record<string, unknown>;
      const val = prefs[key];
      if (typeof val === 'string' && (val.includes('://') || val.startsWith('javascript:'))) {
        prefs[key] = sanitizeUrl(val) || val;
      }
    }
  }

  // 8. Validate mistakeLog entries
  state.mistakes = state.mistakes.filter(
    (m) => m && typeof m === 'object' && m.id && m.problemId && m.date && m.type,
  );

  return state;
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState, resetStorage] = useLocalStorage<ProgressState>(
    PROGRESS_STORAGE_KEY,
    createDefaultState,
    migrateState,
  );

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>) => {
      setState((s) => ({ ...s, preferences: { ...s.preferences, ...sanitizePreferences(patch) } }));
    },
    [setState],
  );

  const completeOnboarding = useCallback(
    (patch: Partial<UserPreferences> & { currentTopicId?: string }) => {
      const { currentTopicId, ...prefPatch } = patch;
      setState((s) => ({
        ...s,
        preferences: { ...s.preferences, ...prefPatch, onboarded: true },
        currentTopicId: currentTopicId ?? s.currentTopicId,
      }));
    },
    [setState],
  );

  const markVideoWatched = useCallback(
    (videoId: string, watched: boolean) => {
      setState((s) => ({
        ...s,
        videoProgress: {
          ...s.videoProgress,
          [videoId]: {
            ...(s.videoProgress[videoId] ?? { videoId, watched: false }),
            watched,
            dateWatched: watched ? todayISO() : undefined,
          },
        },
      }));
    },
    [setState],
  );

  const setVideoNotes = useCallback(
    (videoId: string, notes: string) => {
      setState((s) => ({
        ...s,
        videoProgress: {
          ...s.videoProgress,
          [videoId]: { ...(s.videoProgress[videoId] ?? { videoId, watched: false }), notes },
        },
      }));
    },
    [setState],
  );

  const setProblemStatus = useCallback(
    (problemId: string, status: ProblemStatus) => {
      setState((s) => {
        const existing = getOrCreateProblemProgress(s, problemId);
        const solved = status === 'Solved' || status === 'Mastered';
        const wasSolved = existing.status === 'Solved' || existing.status === 'Mastered';
        return { ...s, problemProgress: { ...s.problemProgress, [problemId]: { ...existing, status, attemptUndo: undefined, ...(solved ? { lastSolved: wasSolved ? existing.lastSolved ?? todayISO() : todayISO(), completedAt: wasSolved ? existing.completedAt ?? new Date().toISOString() : new Date().toISOString() } : { lastSolved: undefined, completedAt: undefined }) } } };
      });
    },
    [setState],
  );

  const toggleProblemSolved = useCallback((problemId: string) => {
    setState((s) => {
      const existing = getOrCreateProblemProgress(s, problemId);
      const solved = existing.status === 'Solved' || existing.status === 'Mastered';
      if (solved) return { ...s, problemProgress: { ...s.problemProgress, [problemId]: { ...existing, status: 'Attempted', outcome: undefined, revisionSchedule: [], completedAt: undefined, lastSolved: undefined, attemptUndo: undefined } } };
      const date = todayISO();
      return { ...s, problemProgress: { ...s.problemProgress, [problemId]: { ...existing, status: 'Solved', outcome: 'Solved independently', lastSolved: date, completedAt: new Date().toISOString(), attemptUndo: undefined, revisionSchedule: buildRevisionSchedule(date, s.preferences.revisionIntervals) } } };
    });
  }, [setState]);

  const recordAttempt = useCallback(
    (problemId: string) => {
      setState((s) => {
        const existing = getOrCreateProblemProgress(s, problemId);
        const attemptedAt = new Date().toISOString();
        const nextStatus = existing.status === 'Not Started' ? 'Attempted' : existing.status;
        return {
          ...s,
          problemProgress: {
            ...s.problemProgress,
            [problemId]: {
              ...existing,
              status: nextStatus,
              attemptCount: existing.attemptCount + 1,
              lastAttempted: todayISO(),
              attemptUndo: {
                attemptedAt,
                previousCount: existing.attemptCount,
                previousStatus: existing.status,
                previousLastAttempted: existing.lastAttempted,
              },
            },
          },
        };
      });
    },
    [setState],
  );

  const undoLastAttempt = useCallback((problemId: string) => {
    setState((s) => {
      const existing = s.problemProgress[problemId];
      const undo = existing?.attemptUndo;
      if (!existing || !undo || existing.attemptCount !== undo.previousCount + 1) return s;
      return {
        ...s,
        problemProgress: {
          ...s.problemProgress,
          [problemId]: {
            ...existing,
            attemptCount: undo.previousCount,
            status: undo.previousStatus,
            lastAttempted: undo.previousLastAttempted,
            attemptUndo: undefined,
          },
        },
      };
    });
  }, [setState]);

  const solveProblem = useCallback(
    (problemId: string, outcome: OutcomeType, notes?: string) => {
      setState((s) => {
        const existing = getOrCreateProblemProgress(s, problemId);
        const today = todayISO();
        // "Could not solve" should NOT mark as Solved — it stays Attempted
        // and does NOT generate a revision schedule.
        const isSolved = outcome !== 'Could not solve';
        return {
          ...s,
          problemProgress: {
            ...s.problemProgress,
            [problemId]: {
              ...existing,
              status: isSolved ? 'Solved' : 'Attempted',
              outcome,
              attemptCount: existing.attemptCount + 1,
              lastAttempted: today,
              lastSolved: isSolved ? today : existing.lastSolved,
              completedAt: isSolved ? new Date().toISOString() : undefined,
              attemptUndo: undefined,
              notes: notes ?? existing.notes,
              revisionSchedule: isSolved
                ? buildRevisionSchedule(today, s.preferences.revisionIntervals)
                : existing.revisionSchedule,
            },
          },
        };
      });
    },
    [setState],
  );

  const setProblemNotes = useCallback(
    (problemId: string, notes: string) => {
      setState((s) => {
        const existing = getOrCreateProblemProgress(s, problemId);
        return { ...s, problemProgress: { ...s.problemProgress, [problemId]: { ...existing, notes } } };
      });
    },
    [setState],
  );

  const rateRevision = useCallback(
    (problemId: string, rating: RevisionRating) => {
      setState((s) => {
        const existing = getOrCreateProblemProgress(s, problemId);
        return {
          ...s,
          problemProgress: { ...s.problemProgress, [problemId]: completeNextRevision(existing, rating) },
        };
      });
    },
    [setState],
  );

  const logMistake = useCallback(
    (problemId: string, type: MistakeType, note?: string) => {
      setState((s) => {
        const entry: MistakeLogEntry = {
          id: `mistake-${Date.now()}`,
          problemId,
          date: todayISO(),
          type,
          note,
        };
        return { ...s, mistakes: [entry, ...s.mistakes] };
      });
    },
    [setState],
  );

  const logStudyMinutes = useCallback(
    (
      minutes: number,
      opts?: { topicId?: string; problemIds?: string[]; videoIds?: string[] },
    ) => {
      setState((s) => {
        const today = todayISO();
        const existingDaily = s.dailyActivity[today] ?? { date: today, studyMin: 0, problemsSolved: 0, videosWatched: 0 };
        const updatedDaily = {
          ...existingDaily,
          studyMin: existingDaily.studyMin + minutes,
          problemsSolved: existingDaily.problemsSolved + (opts?.problemIds?.length ?? 0),
          videosWatched: existingDaily.videosWatched + (opts?.videoIds?.length ?? 0),
        };

        // streak bookkeeping
        let { current, longest, lastActiveDate } = s.streak;
        const metStreakThreshold = updatedDaily.studyMin >= s.preferences.minMinutesForStreak;
        if (metStreakThreshold && lastActiveDate !== today) {
          const wasYesterdayOrFirstEver =
            !lastActiveDate || isConsecutiveDay(lastActiveDate, today);
          current = wasYesterdayOrFirstEver ? current + 1 : 1;
          longest = Math.max(longest, current);
          lastActiveDate = today;
        }

        return {
          ...s,
          dailyActivity: { ...s.dailyActivity, [today]: updatedDaily },
          streak: { current, longest, lastActiveDate },
        };
      });
    },
    [setState],
  );

  const addSession = useCallback(
    (session: Omit<StudySession, 'id'>) => {
      setState((s) => ({
        ...s,
        sessions: [{ ...session, id: `session-${Date.now()}` }, ...s.sessions],
      }));
    },
    [setState],
  );

  const completeTaskToday = useCallback(
    (taskId: string) => {
      setState((s) => {
        const today = todayISO();
        const existing = s.taskCompletionsToday[today] ?? [];
        const next = existing.includes(taskId) ? existing.filter((id) => id !== taskId) : [...existing, taskId];
        return { ...s, taskCompletionsToday: { ...s.taskCompletionsToday, [today]: next } };
      });
    },
    [setState],
  );

  const isTaskCompletedToday = useCallback(
    (taskId: string) => {
      const today = todayISO();
      return (state.taskCompletionsToday[today] ?? []).includes(taskId);
    },
    [state.taskCompletionsToday],
  );

  const setCurrentTopic = useCallback(
    (topicId: string) => {
      setState((s) => ({ ...s, currentTopicId: topicId }));
    },
    [setState],
  );

  const markTopicCompleted = useCallback(
    (topicId: string) => {
      setState((s) => ({
        ...s,
        completedTopicIds: s.completedTopicIds.includes(topicId)
          ? s.completedTopicIds
          : [...s.completedTopicIds, topicId],
      }));
    },
    [setState],
  );

  const exportData = useCallback(() => JSON.stringify({ app: 'DSA Command Center', version: 1, exportedAt: new Date().toISOString(), progress: state }, null, 2), [state]);

  const importData = useCallback(
    (json: string): { ok: boolean; error?: string } => {
      try {
        const envelope = JSON.parse(json) as { app?: string; version?: number; progress?: Partial<ProgressState> } & Partial<ProgressState>;
        const parsed = (envelope.progress ?? envelope) as Partial<ProgressState>;
        if (!parsed || typeof parsed !== 'object' || !('preferences' in parsed)) {
          return { ok: false, error: 'This file doesn\u2019t look like a DSA Tracker backup.' };
        }
        // Reject prototype pollution attempts
        if (!hasNoPrototypeKeys(parsed)) {
          return { ok: false, error: 'Backup file contains unsafe data and was rejected.' };
        }
        // Validate preferences is a non-null object
        if (!parsed.preferences || typeof parsed.preferences !== 'object') {
          return { ok: false, error: 'Invalid preferences data in backup file.' };
        }
        // Merge with defaults, then migrate/repair
        const raw = {
          ...createDefaultState(),
          ...parsed,
          preferences: { ...createDefaultState().preferences, ...parsed.preferences },
        } as ProgressState;
        setState(migrateState(raw));
        return { ok: true };
      } catch {
        return { ok: false, error: 'Could not parse that file as JSON.' };
      }
    },
    [setState],
  );

  const resetProgress = useCallback(() => {
    resetStorage();
  }, [resetStorage]);

  const value = useMemo<ProgressContextValue>(
    () => ({
      state,
      setState,
      updatePreferences,
      completeOnboarding,
      markVideoWatched,
      setVideoNotes,
      setProblemStatus,
      toggleProblemSolved,
      recordAttempt,
      undoLastAttempt,
      solveProblem,
      setProblemNotes,
      rateRevision,
      logMistake,
      logStudyMinutes,
      addSession,
      completeTaskToday,
      isTaskCompletedToday,
      setCurrentTopic,
      markTopicCompleted,
      exportData,
      importData,
      resetProgress,
    }),
    [
      state,
      setState,
      updatePreferences,
      completeOnboarding,
      markVideoWatched,
      setVideoNotes,
      setProblemStatus,
      toggleProblemSolved,
      recordAttempt,
      undoLastAttempt,
      solveProblem,
      setProblemNotes,
      rateRevision,
      logMistake,
      logStudyMinutes,
      addSession,
      completeTaskToday,
      isTaskCompletedToday,
      setCurrentTopic,
      markTopicCompleted,
      exportData,
      importData,
      resetProgress,
    ],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

function isConsecutiveDay(lastISO: string, todayISOStr: string): boolean {
  // Parse date components directly to avoid timezone issues
  const parseDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const last = parseDate(lastISO);
  const today = parseDate(todayISOStr);
  const diffDays = Math.round((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used within a ProgressProvider');
  return ctx;
}

// Re-export for convenience in components that only need derived stats.
export { computeAllTopicStats, getProblemById };
