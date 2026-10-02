import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
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
import { createDefaultState, sanitizePreferences, PROGRESS_STORAGE_KEY } from '@/data/defaultState';
import { getProblemById } from '@/data/problems';
import { todayISO } from '@/utils/date';
import { buildRevisionSchedule, completeNextRevision } from '@/utils/revision';
import { computeAllTopicStats } from '@/utils/analytics';
import { sanitizeUrl, hasNoPrototypeKeys } from '@/utils/sanitize';
import { loadProgress, importLocalProgress, mergeProgress, changedProgressTables } from '@/lib/progressRepository';
import { useAuth } from '@/context/AuthContext';
import { DebouncedSyncQueue } from '@/lib/debouncedSyncQueue';

interface ProgressContextValue {
  state: ProgressState;
  setState: Dispatch<SetStateAction<ProgressState>>;
  syncState: 'loading' | 'synced' | 'offline' | 'syncing';
  syncError: string | null;
  retrySync: () => void;

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
  completeTaskToday: (taskId: string, minutes?: number) => void;
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

let mistakeIdFallbackCounter = 0;

/** Create a collision-resistant local ID; repository sync converts non-UUID IDs deterministically. */
export function createMistakeId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return `mistake-${cryptoApi.randomUUID()}`;
  }

  mistakeIdFallbackCounter += 1;
  const randomPart = (() => {
    if (typeof cryptoApi?.getRandomValues === 'function') {
      const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
      return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  })();
  return `mistake-${Date.now()}-${mistakeIdFallbackCounter}-${randomPart}`;
}

export function prependMistake(state: ProgressState, entry: MistakeLogEntry): ProgressState {
  return { ...state, mistakes: [entry, ...state.mistakes] };
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
      .filter(([, plan]) => plan && typeof plan === 'object' && Array.isArray((plan as any).tasks))
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

  // 3. Preserve historical task completions for cloud migration and analytics.
  const cleanedTasks: Record<string, string[]> = {};
  for (const [date, taskIds] of Object.entries(state.taskCompletionsToday)) {
    if (Array.isArray(taskIds)) {
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

export function ProgressProvider({ children, user }: { children: ReactNode; user: User }) {
  const [state, setStateRaw] = useState<ProgressState>(createDefaultState);
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<ProgressContextValue['syncState']>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [migrationChoice, setMigrationChoice] = useState<{ cloud: ProgressState; local: ProgressState } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const stateRef = useRef(state);
  const baselineRef = useRef<ProgressState>(createDefaultState());
  const readyRef = useRef(false);
  const localRevisionRef = useRef(0);
  const syncQueueRef = useRef<DebouncedSyncQueue<{ merged: ProgressState; revision: number } | null> | null>(null);
  const syncQueueCleanupRef = useRef<(() => void) | null>(null);
  useAuth();

  const retrySync = useCallback(() => {
    if (syncQueueRef.current?.hasPendingWork) syncQueueRef.current.retry();
    else setRetryCount((n) => n + 1);
  }, []);

  const installSyncQueue = useCallback((account: User) => {
    syncQueueCleanupRef.current?.();
    let queue: DebouncedSyncQueue<{ merged: ProgressState; revision: number } | null>;
    queue = new DebouncedSyncQueue(async () => {
      const snapshot = stateRef.current;
      const revision = localRevisionRef.current;
      const tables = changedProgressTables(baselineRef.current,snapshot);
      if (!tables.length) return null;
      const latest = await loadProgress(account,tables,baselineRef.current);
      if (syncQueueRef.current !== queue || localRevisionRef.current !== revision) return null;
      const merged = mergeProgress(baselineRef.current, snapshot, latest);
      await importLocalProgress(account, merged, true, latest);
      return { merged, revision };
    }, (status, error) => {
      if (syncQueueRef.current !== queue) return;
      setSyncState(status);
      if (status === 'offline') setSyncError(error instanceof Error ? error.message : 'Progress could not be saved.');
      else if (status === 'synced') setSyncError(null);
    }, 600, (result, isLatest) => {
      if (syncQueueRef.current !== queue || !result) return;
      baselineRef.current = result.merged;
      try { localStorage.setItem(`${PROGRESS_STORAGE_KEY}:baseline:${account.id}`, JSON.stringify(result.merged)); } catch { /* in-memory baseline remains valid */ }
      // Never apply a response after another local edit was queued during its request.
      if (isLatest && localRevisionRef.current === result.revision && JSON.stringify(result.merged) !== JSON.stringify(stateRef.current)) {
        stateRef.current = result.merged;
        setStateRaw(result.merged);
      }
    });
    syncQueueRef.current = queue;
    const onOnline = () => queue.retry();
    window.addEventListener('online', onOnline);
    const cleanup = () => {
      window.removeEventListener('online', onOnline);
      queue.dispose();
      if (syncQueueRef.current === queue) syncQueueRef.current = null;
      if (syncQueueCleanupRef.current === cleanup) syncQueueCleanupRef.current = null;
    };
    syncQueueCleanupRef.current = cleanup;
    return cleanup;
  }, []);

  const setState = useCallback<Dispatch<SetStateAction<ProgressState>>>((next) => {
    const current = stateRef.current;
    const value = typeof next === 'function' ? next(current) : next;
    if (value === current) return;
    stateRef.current = value;
    localRevisionRef.current += 1;
    setStateRaw(value);
    try { localStorage.setItem(`${PROGRESS_STORAGE_KEY}:${user.id}`, JSON.stringify(value)); } catch { /* pending state remains in memory */ }
    syncQueueRef.current?.schedule();
  }, [user.id]);

  useEffect(() => {
    let active = true;
    const hadReadyState = readyRef.current;
    const offlineSnapshot = stateRef.current;
    const offlineBaseline = baselineRef.current;
    readyRef.current = false;
    setReady(false);
    setSyncState('loading');
    setSyncError(null);
    const localKey = `${PROGRESS_STORAGE_KEY}:${user.id}`;
    const baselineKey = `${PROGRESS_STORAGE_KEY}:baseline:${user.id}`;
    let legacy: ProgressState | null = null;
    try {
      const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (raw) legacy = migrateState(JSON.parse(raw));
    } catch { /* Keep cloud/default state when legacy storage is unreadable. */ }
    void loadProgress(user).then(async (cloud) => {
      if (!active) return;
      const marker = `dsa-legacy-progress-reviewed:${user.id}`;
      const hasLegacyData = Boolean(legacy && (Object.keys(legacy.problemProgress).length || Object.keys(legacy.videoProgress).length || legacy.sessions.length || legacy.mistakes.length || legacy.preferences.onboarded));
      if (legacy && hasLegacyData && !localStorage.getItem(marker)) {
        setMigrationChoice({ cloud, local: legacy });
        return;
      }
      if (!active) return;
      const remoteState = migrateState(cloud);
      const scoped = localStorage.getItem(localKey);
      const cachedState = scoped ? migrateState(JSON.parse(scoped)) : null;
      const rawBaseline = localStorage.getItem(baselineKey);
      const cachedBaseline = rawBaseline ? migrateState(JSON.parse(rawBaseline)) : createDefaultState();
      const localCandidate = hadReadyState ? offlineSnapshot : cachedState;
      const localBase = hadReadyState ? offlineBaseline : cachedBaseline;
      const initial = migrateState(localCandidate ? mergeProgress(localBase, localCandidate, remoteState) : remoteState);
      if (localCandidate && JSON.stringify(initial) !== JSON.stringify(remoteState)) {
        await importLocalProgress(user, initial, true, remoteState);
      }
      baselineRef.current = initial;
      localStorage.setItem(baselineKey, JSON.stringify(initial));
      stateRef.current = initial;
      setStateRaw(initial);
      localStorage.setItem(localKey, JSON.stringify(initial));
      installSyncQueue(user);
      readyRef.current = true;
      setReady(true);
      setSyncState('synced');
    }).catch((error: unknown) => {
      if (!active) return;
      const scoped = localStorage.getItem(localKey);
      let fallback = createDefaultState();
      try { if (scoped) fallback = migrateState(JSON.parse(scoped)); else if (legacy) fallback = legacy; } catch { /* use defaults */ }
      try {
        const savedBaseline = localStorage.getItem(baselineKey);
        baselineRef.current = savedBaseline ? migrateState(JSON.parse(savedBaseline)) : fallback;
      } catch { baselineRef.current = fallback; }
      stateRef.current = fallback;
      setStateRaw(fallback);
      installSyncQueue(user);
      readyRef.current = true;
      setReady(true);
      setSyncState('offline');
      setSyncError(error instanceof Error ? error.message : 'Cloud progress could not be loaded.');
    });
    return () => {
      active = false;
      readyRef.current = false;
      syncQueueCleanupRef.current?.();
    };
  }, [user, retryCount, installSyncQueue]);

  const chooseLegacyImport = useCallback(async (shouldImport: boolean) => {
    if (!migrationChoice) return;
    setSyncState('syncing');
    try {
      if (shouldImport) {
        await importLocalProgress(user, migrationChoice.local, false);
      }
      localStorage.setItem(`dsa-legacy-progress-reviewed:${user.id}`, shouldImport ? 'imported' : 'skipped');
      const next = shouldImport ? await loadProgress(user) : migrationChoice.cloud;
      const repaired = migrateState(next);
      baselineRef.current = repaired;
      localStorage.setItem(`${PROGRESS_STORAGE_KEY}:baseline:${user.id}`, JSON.stringify(repaired));
      stateRef.current = repaired;
      setStateRaw(repaired);
      localStorage.setItem(`${PROGRESS_STORAGE_KEY}:${user.id}`, JSON.stringify(repaired));
      setMigrationChoice(null);
      installSyncQueue(user);
      readyRef.current = true;
      setReady(true);
      setSyncState('synced');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Local progress could not be imported. Your browser copy is unchanged.');
      setSyncState('offline');
    }
  }, [migrationChoice, user, installSyncQueue]);

  useEffect(() => {
    if (!ready) return;
    const localKey = `${PROGRESS_STORAGE_KEY}:${user.id}`;
    try { localStorage.setItem(localKey, JSON.stringify(state)); } catch { /* offline memory still works */ }
  }, [ready, state, user.id]);

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
      const date = todayISO();
      // Track study minutes + solve count for quick-solve toggles (plan rows)
      // so weekly momentum reflects them, mirroring the modal's accounting.
      const problem = getProblemById(problemId);
      const est = problem?.estimatedTime ?? 0;
      let dailyActivity = s.dailyActivity;
      if (est > 0) {
        const entry = s.dailyActivity[date] ?? { date, studyMin: 0, problemsSolved: 0, videosWatched: 0 };
        dailyActivity = {
          ...s.dailyActivity,
          [date]: {
            ...entry,
            studyMin: Math.max(0, entry.studyMin + (solved ? -est : est)),
            problemsSolved: Math.max(0, entry.problemsSolved + (solved ? -1 : 1)),
            videosWatched: entry.videosWatched,
          },
        };
      }
      if (solved) return { ...s, problemProgress: { ...s.problemProgress, [problemId]: { ...existing, status: 'Attempted', outcome: undefined, revisionSchedule: [], completedAt: undefined, lastSolved: undefined, attemptUndo: undefined } }, dailyActivity };
      return { ...s, problemProgress: { ...s.problemProgress, [problemId]: { ...existing, status: 'Solved', outcome: 'Solved independently', lastSolved: date, completedAt: new Date().toISOString(), attemptUndo: undefined, revisionSchedule: buildRevisionSchedule(date, s.preferences.revisionIntervals) } }, dailyActivity };
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
          id: createMistakeId(),
          problemId,
          date: todayISO(),
          type,
          note,
        };
        return prependMistake(s, entry);
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
    (taskId: string, minutes?: number) => {
      setState((s) => {
        const today = todayISO();
        const existing = s.taskCompletionsToday[today] ?? [];
        const alreadyDone = existing.includes(taskId);
        const next = alreadyDone ? existing.filter((id) => id !== taskId) : [...existing, taskId];
        let dailyActivity = s.dailyActivity;
        // Track study minutes for every completion (not just modal submissions)
        // so the weekly-momentum ring and 7-day bars reflect checked-off work.
        if (minutes && minutes > 0) {
          const entry = s.dailyActivity[today] ?? { date: today, studyMin: 0, problemsSolved: 0, videosWatched: 0 };
          const delta = alreadyDone ? -minutes : minutes;
          dailyActivity = {
            ...s.dailyActivity,
            [today]: {
              ...entry,
              studyMin: Math.max(0, entry.studyMin + delta),
              problemsSolved: entry.problemsSolved,
              videosWatched: entry.videosWatched,
            },
          };
        }
        return { ...s, taskCompletionsToday: { ...s.taskCompletionsToday, [today]: next }, dailyActivity };
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

  const resetProgress = useCallback(() => { setState(createDefaultState()); }, [setState]);

  const value = useMemo<ProgressContextValue>(
    () => ({
      state,
      setState,
      syncState,
      syncError,
      retrySync,
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
      syncState,
      syncError,
      retrySync,
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

  if (migrationChoice) return <main className="auth-screen"><section className="migration-card"><h1>Import browser progress?</h1><p>This browser has older DSA progress. Importing adds rows that are missing in this account; existing cloud rows take precedence. Your browser copy will be kept.</p>{syncError && <p role="alert" className="auth-message error">{syncError}</p>}<div><button className="primary-btn" onClick={() => void chooseLegacyImport(true)} disabled={syncState === 'syncing'}>Import local progress</button><button className="secondary-btn" onClick={() => void chooseLegacyImport(false)} disabled={syncState === 'syncing'}>Use cloud account only</button></div></section></main>;
  if (!ready) return <div className="auth-loading" role="status">Loading your saved progress…</div>;
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
