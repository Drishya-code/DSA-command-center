import { describe, it, expect } from 'vitest';
import { generateDayPlan } from '../utils/scheduler';
import { computeTopicStats } from '../utils/analytics';
import { topics } from '../data/dsaRoadmap';
import type { ProgressState } from '../types';
import { vi } from 'vitest';
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
import { mergeProgress, changedProgressTables, importLocalProgress, loadProgress } from '@/lib/progressRepository';
import { createDefaultState } from '@/data/defaultState';
import { createMistakeId, prependMistake } from '@/context/ProgressContext';

describe('DSA Command Center Core Logic', () => {
  const baseState: ProgressState = {
    completedTopicIds: [],
    problemProgress: {},
    videoProgress: {},
    mistakes: [],
    sessions: [],
    dailyActivity: {},
    streak: { current: 0, longest: 0, lastActiveDate: '' },
    currentTopicId: 'fundamentals',
    taskCompletionsToday: {},
    dailyPlans: {},
    plannerPreferences: {
      dailyBudgetMin: 60,
      preferredTopicIds: [],
      difficultyPreference: ['Easy', 'Medium', 'Hard']
    },
    preferences: {
      onboarded: true,
      name: 'Test',
      weeklyHoursTarget: 10,
      studyDaysPerWeek: 5,
      preferredStudyTime: 'Morning',
      currentLevel: 'Beginner',
      difficultyPreference: ['Easy', 'Medium', 'Hard'],
      theme: 'dark',
      revisionIntervals: [1, 3, 7],
      minMinutesForStreak: 15
    },
    schemaVersion: 1
  };

  it('should compute topic stats correctly', () => {
    const state = baseState;
    const stats = computeTopicStats(topics[0], state);
    expect(stats.totalProblems).toBeGreaterThan(0);
    expect(stats.status).toBe('Not Started');
  });

  it('should generate a day plan', () => {
    const state = baseState;
    const plan = generateDayPlan('2026-09-27', state);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.dailyBudgetMin).toBe(60);
  });

  it('merges local edits while preserving newer cloud values and avoids duplicate history rows', () => {
    const base = createDefaultState();
    base.preferences.name = 'Base';
    const local = structuredClone(base);
    const cloud = structuredClone(base);
    local.preferences.name = 'Local edit';
    local.problemProgress['q1'] = { problemId:'q1', status:'Solved', attemptCount:1, revisionSchedule:[], timeSpentMin:10 };
    cloud.problemProgress['q2'] = { problemId:'q2', status:'Attempted', attemptCount:1, revisionSchedule:[], timeSpentMin:4 };
    local.sessions = [{id:'s1',date:'2026-10-02',minutes:20}];
    cloud.sessions = [{id:'s1',date:'2026-10-02',minutes:20}];
    const merged = mergeProgress(base,local,cloud);
    expect(merged.preferences.name).toBe('Local edit');
    expect(merged.problemProgress.q1.status).toBe('Solved');
    expect(merged.problemProgress.q2.status).toBe('Attempted');
    expect(merged.sessions).toHaveLength(1);
  });

  it('chooses cloud data if both devices changed the same field since the baseline', () => {
    const base = createDefaultState();
    base.preferences.name = 'Base';
    const local = structuredClone(base);
    const cloud = structuredClone(base);
    local.preferences.name = 'Local newer?';
    cloud.preferences.name = 'Cloud edit';
    expect(mergeProgress(base,local,cloud).preferences.name).toBe('Cloud edit');
  });

  it('keeps a remote row edited since the baseline when a local state removed it', () => {
    const base = createDefaultState();
    base.problemProgress.q1 = { problemId:'q1', status:'Attempted', attemptCount:1, revisionSchedule:[], timeSpentMin:1 };
    const local = structuredClone(base);
    const cloud = structuredClone(base);
    delete local.problemProgress.q1;
    cloud.problemProgress.q1 = { ...cloud.problemProgress.q1, status:'Solved', attemptCount:2 };
    expect(mergeProgress(base,local,cloud).problemProgress.q1.status).toBe('Solved');
  });

  it('honors local removal when the cloud row has not changed', () => {
    const base = createDefaultState();
    base.completedTopicIds = ['arrays'];
    base.mistakes = [{id:'m1',problemId:'q1',date:'2026-10-01',type:'Logic error'}];
    const local = structuredClone(base);
    const cloud = structuredClone(base);
    local.completedTopicIds = [];
    local.mistakes = [];
    const merged = mergeProgress(base,local,cloud);
    expect(merged.completedTopicIds).toEqual([]);
    expect(merged.mistakes).toEqual([]);
  });

  it('limits a progress edit to the affected Supabase tables', () => {
    const base = createDefaultState();
    const local = structuredClone(base);
    local.problemProgress.q1 = { problemId:'q1', status:'Solved', attemptCount:1, revisionSchedule:[], timeSpentMin:10 };
    local.dailyActivity['2026-10-02'] = { date:'2026-10-02', studyMin:10, problemsSolved:1, videosWatched:0 };
    expect(changedProgressTables(base,local).sort()).toEqual(['daily_activity','user_progress']);
  });

  it('creates distinct mistake IDs for entries logged in the same millisecond and keeps both in state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    const ids = [createMistakeId(), createMistakeId()];
    expect(new Set(ids).size).toBe(2);
    const base = createDefaultState();
    const withFirst = prependMistake(base, { id:ids[0], problemId:'q1', date:'2026-10-02', type:'Logic error' });
    const withBoth = prependMistake(withFirst, { id:ids[1], problemId:'q2', date:'2026-10-02', type:'Edge case' });
    expect(withBoth.mistakes.map((mistake) => mistake.id)).toEqual([ids[1], ids[0]]);
    vi.restoreAllMocks();
  });

  it('uses a unique fallback when crypto.randomUUID is unavailable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    expect(createMistakeId()).not.toBe(createMistakeId());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves two mistakes through change detection, merge, local JSON persistence, and retry state', () => {
    const base = createDefaultState();
    const local = structuredClone(base);
    local.mistakes = [
      { id:'mistake-a', problemId:'q1', date:'2026-10-02', type:'Logic error' },
      { id:'mistake-b', problemId:'q2', date:'2026-10-02', type:'Edge case' },
    ];
    expect(changedProgressTables(base, local)).toContain('mistakes');
    expect(mergeProgress(base, local, structuredClone(base)).mistakes).toHaveLength(2);
    const restored = JSON.parse(JSON.stringify(local)) as ProgressState;
    expect(restored.mistakes.map(({ id }) => id).sort()).toEqual(['mistake-a','mistake-b']);
  });

  it('maps two mistakes to separate user-scoped Supabase rows and loads them back', async () => {
    const upserts: Array<{ table:string; rows:any[] }> = [];
    const cloudRows = [
      { id:'row-a', user_id:'user-1', problem_id:'q1', type:'Logic error', note:null, date:'2026-10-02T00:00:00.000Z' },
      { id:'row-b', user_id:'user-1', problem_id:'q2', type:'Edge case', note:null, date:'2026-10-02T00:00:00.000Z' },
    ];
    supabaseMock.from.mockImplementation((table:string) => ({
      upsert: async (rows:any[]) => { upserts.push({ table, rows }); return { data:null, error:null }; },
      select: () => ({ eq: async () => ({ data:cloudRows, error:null }) }),
    }));
    const previous = createDefaultState();
    const next = structuredClone(previous);
    next.mistakes = [
      { id:'mistake-a', problemId:'q1', date:'2026-10-02', type:'Logic error' },
      { id:'mistake-b', problemId:'q2', date:'2026-10-02', type:'Edge case' },
    ];
    await importLocalProgress({ id:'user-1', user_metadata:{} } as any, next, true, previous);
    const mistakeUpsert = upserts.find(({ table }) => table === 'mistakes');
    expect(mistakeUpsert?.rows).toHaveLength(2);
    expect(new Set(mistakeUpsert?.rows.map(({ id }) => id)).size).toBe(2);
    expect(mistakeUpsert?.rows.every(({ user_id }) => user_id === 'user-1')).toBe(true);

    const loaded = await loadProgress({ id:'user-1', user_metadata:{} } as any, ['mistakes']);
    expect(loaded.mistakes.map(({ problemId }) => problemId).sort()).toEqual(['q1','q2']);
  });
});
