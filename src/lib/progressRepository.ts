import type { User } from '@supabase/supabase-js';
import type { ProgressState } from '@/types';
import { createDefaultState } from '@/data/defaultState';
import { supabase } from '@/lib/supabase';

type Row = Record<string, any>;
const TABLE_NAMES = ['user_progress','video_progress','mistakes','sessions','daily_activity','streaks','completed_topics','current_topic','task_completions','daily_plans','planner_preferences','preferences'] as const;
const dateOnly = (value?: string | null) => value ? value.slice(0, 10) : undefined;
const timestamp = (value?: string | null) => value ? (value.length === 10 ? `${value}T00:00:00.000Z` : value) : null;
const fromSnakeTask = (t: Row) => ({ id: t.id, kind: t.kind, title: t.title, subtitle: t.subtitle, topicId: t.topic_id, topicTitle: t.topic_title, difficulty: t.difficulty, estimatedMin: t.estimated_min, refId: t.ref_id, url: t.url, priorityLabel: t.priority_label, priorityRank: t.priority_rank, reason: t.reason });
const toSnakeTask = (t: Row) => ({ id: t.id, kind: t.kind, title: t.title, subtitle: t.subtitle, topic_id: t.topicId, topic_title: t.topicTitle, difficulty: t.difficulty, estimated_min: t.estimatedMin, ref_id: t.refId, url: t.url, priority_label: t.priorityLabel, priority_rank: t.priorityRank, reason: t.reason });

function assert<T>(result: { data: T | null; error: any }): T {
  if (result.error) throw result.error;
  return result.data as T;
}
export async function loadProgress(user: User, tables: readonly string[] = TABLE_NAMES, base?: ProgressState): Promise<ProgressState> {
  const names = TABLE_NAMES.filter((table) => tables.includes(table));
  const results = await Promise.all(names.map((table) => (supabase.from(table) as any).select('*').eq('user_id', user.id)));
  const data = Object.fromEntries(TABLE_NAMES.map((name) => [name, [] as Row[]])) as Record<typeof TABLE_NAMES[number], Row[]>;
  names.forEach((name, i) => { data[name] = assert<Row[]>(results[i]); });
  const defaults = createDefaultState();
  const state: ProgressState = base ? {
    ...base,
    preferences: { ...base.preferences }, problemProgress: { ...base.problemProgress }, videoProgress: { ...base.videoProgress },
    mistakes: [...base.mistakes], sessions: [...base.sessions], dailyActivity: { ...base.dailyActivity }, streak: { ...base.streak },
    completedTopicIds: [...base.completedTopicIds], taskCompletionsToday: Object.fromEntries(Object.entries(base.taskCompletionsToday).map(([d,ids]) => [d,[...ids]])),
    dailyPlans: { ...base.dailyPlans }, plannerPreferences: { ...base.plannerPreferences },
  } : defaults;
  if (names.includes('user_progress')) state.problemProgress = {};
  if (names.includes('video_progress')) state.videoProgress = {};
  if (names.includes('mistakes')) state.mistakes = [];
  if (names.includes('sessions')) state.sessions = [];
  if (names.includes('daily_activity')) state.dailyActivity = {};
  if (names.includes('streaks')) state.streak = { current:0, longest:0 };
  if (names.includes('completed_topics')) state.completedTopicIds = [];
  if (names.includes('current_topic')) state.currentTopicId = defaults.currentTopicId;
  if (names.includes('task_completions')) state.taskCompletionsToday = {};
  if (names.includes('daily_plans')) state.dailyPlans = {};
  if (names.includes('planner_preferences')) state.plannerPreferences = { ...defaults.plannerPreferences };
  if (names.includes('preferences')) state.preferences = { ...defaults.preferences, name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '' };
  const pref = data.preferences[0];
  if (pref) state.preferences = { onboarded: pref.onboarded, name: pref.name ?? '', weeklyHoursTarget: pref.weekly_hours_target, studyDaysPerWeek: pref.study_days_per_week, preferredStudyTime: pref.preferred_study_time, currentLevel: pref.current_level, difficultyPreference: pref.difficulty_preference ?? [], theme: pref.theme, revisionIntervals: pref.revision_intervals ?? [1,7,30], minMinutesForStreak: pref.min_minutes_for_streak };
  for (const r of data.user_progress) state.problemProgress[r.question_id] = { problemId: r.question_id, status: r.status, attemptCount: r.attempt_count, outcome: r.outcome ?? undefined, lastAttempted: dateOnly(r.last_attempted), lastSolved: dateOnly(r.last_solved), completedAt: r.completed_at ?? undefined, timeSpentMin: r.time_spent_min, notes: r.notes ?? undefined, revisionSchedule: r.revision_schedule ?? [], attemptUndo: r.attempt_undo ? { attemptedAt: r.attempt_undo.attempted_at, previousCount: r.attempt_undo.previous_count, previousStatus: r.attempt_undo.previous_status, previousLastAttempted: r.attempt_undo.previous_last_attempted } : undefined };
  for (const r of data.video_progress) state.videoProgress[r.video_id] = { videoId:r.video_id, watched:r.watched, dateWatched:dateOnly(r.date_watched), notes:r.notes ?? undefined };
  if (names.includes('mistakes')) state.mistakes = data.mistakes.map(r => ({ id:r.id, problemId:r.problem_id, type:r.type, date:dateOnly(r.date) ?? '', note:r.note ?? undefined }));
  if (names.includes('sessions')) state.sessions = data.sessions.map(r => ({ id:r.id, date:dateOnly(r.date) ?? '', minutes:r.minutes, topicId:r.topic_id ?? undefined, problemIds:r.problem_ids ?? [], videoIds:r.video_ids ?? [] }));
  for (const r of data.daily_activity) state.dailyActivity[r.date] = { date:r.date, studyMin:r.study_min, problemsSolved:r.problems_solved, videosWatched:r.videos_watched };
  const streak = data.streaks[0];
  if (streak) state.streak = { current:streak.current, longest:streak.longest, lastActiveDate:dateOnly(streak.last_active_date) };
  if (names.includes('completed_topics')) state.completedTopicIds = data.completed_topics.map(r => r.topic_id);
  state.currentTopicId = data.current_topic[0]?.topic_id ?? state.currentTopicId;
  for (const r of data.task_completions) (state.taskCompletionsToday[r.date] ??= []).push(r.task_id);
  for (const r of data.daily_plans) state.dailyPlans[r.date] = { date:r.date, tasks:(r.tasks ?? []).map(fromSnakeTask), totalEstimatedMin:r.total_estimated_min, dailyBudgetMin:r.daily_budget_min };
  const planner = data.planner_preferences[0];
  if (planner) state.plannerPreferences = { dailyBudgetMin:planner.daily_budget_min, preferredTopicIds:planner.preferred_topic_ids ?? [], difficultyPreference:planner.difficulty_preference ?? [] };
  return state;
}

/** Return only tables with locally changed data so one edit does not re-read every progress table. */
export function changedProgressTables(base: ProgressState, local: ProgressState): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const recordsDiffer = (a: Record<string,unknown>, b: Record<string,unknown>) => !same(Object.keys(a).sort().map(k => [k,a[k]]),Object.keys(b).sort().map(k => [k,b[k]]));
  const tables: string[] = [];
  if (recordsDiffer(base.problemProgress,local.problemProgress)) tables.push('user_progress');
  if (recordsDiffer(base.videoProgress,local.videoProgress)) tables.push('video_progress');
  if (recordsDiffer(base.dailyActivity,local.dailyActivity)) tables.push('daily_activity');
  if (!same(base.taskCompletionsToday,local.taskCompletionsToday)) tables.push('task_completions');
  if (recordsDiffer(base.dailyPlans,local.dailyPlans)) tables.push('daily_plans');
  if (!same(base.preferences,local.preferences)) tables.push('preferences');
  if (!same(base.plannerPreferences,local.plannerPreferences)) tables.push('planner_preferences');
  if (!same(base.streak,local.streak)) tables.push('streaks');
  if (base.currentTopicId !== local.currentTopicId) tables.push('current_topic');
  if (!same([...base.completedTopicIds].sort(),[...local.completedTopicIds].sort())) tables.push('completed_topics');
  if (!same([...base.mistakes].sort((a,b) => a.id.localeCompare(b.id)),[...local.mistakes].sort((a,b) => a.id.localeCompare(b.id)))) tables.push('mistakes');
  if (!same([...base.sessions].sort((a,b) => a.id.localeCompare(b.id)),[...local.sessions].sort((a,b) => a.id.localeCompare(b.id)))) tables.push('sessions');
  return tables;
}

/** Three-way merge: untouched local fields take fresh cloud values; simultaneous edits favor cloud. */
export function mergeProgress(base: ProgressState, local: ProgressState, cloud: ProgressState): ProgressState {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const value = <T,>(before: T, mine: T, theirs: T): T => equal(mine,before) ? theirs : equal(theirs,before) || equal(mine,theirs) ? mine : theirs;
  const record = <T,>(before: Record<string,T>, mine: Record<string,T>, theirs: Record<string,T>) => {
    const out: Record<string,T> = {};
    for (const key of new Set([...Object.keys(before),...Object.keys(mine),...Object.keys(theirs)])) {
      if (!(key in mine)) {
        if (!(key in before)) { if (key in theirs) out[key]=theirs[key]; continue; }
        if (key in theirs && !equal(theirs[key],before[key])) out[key]=theirs[key];
        continue;
      }
      if (!(key in theirs)) {
        if (!(key in before) && key in mine) out[key]=mine[key];
        else if (key in before && !equal(mine[key],before[key])) out[key]=mine[key];
        continue;
      }
      if (key in mine && key in theirs) out[key]=value(before[key],mine[key],theirs[key]);
    }
    return out;
  };
  const topicSet = (before: string[], mine: string[], theirs: string[]) => {
    const b=new Set(before), m=new Set(mine), c=new Set(theirs);
    return [...new Set([...before,...mine,...theirs])].filter((id) => value(b.has(id),m.has(id),c.has(id)));
  };
  return {
    ...cloud,
    preferences: Object.fromEntries([...new Set([...Object.keys(base.preferences),...Object.keys(local.preferences),...Object.keys(cloud.preferences)])].map((k) => [k,value((base.preferences as any)[k],(local.preferences as any)[k],(cloud.preferences as any)[k])])) as ProgressState['preferences'],
    plannerPreferences: value(base.plannerPreferences,local.plannerPreferences,cloud.plannerPreferences),
    streak: value(base.streak,local.streak,cloud.streak),
    currentTopicId: value(base.currentTopicId,local.currentTopicId,cloud.currentTopicId),
    problemProgress: record(base.problemProgress,local.problemProgress,cloud.problemProgress),
    videoProgress: record(base.videoProgress,local.videoProgress,cloud.videoProgress),
    dailyActivity: record(base.dailyActivity,local.dailyActivity,cloud.dailyActivity),
    dailyPlans: record(base.dailyPlans,local.dailyPlans,cloud.dailyPlans),
    taskCompletionsToday: record(base.taskCompletionsToday,local.taskCompletionsToday,cloud.taskCompletionsToday),
    mistakes: Object.values(record(Object.fromEntries(base.mistakes.map(x => [x.id,x])),Object.fromEntries(local.mistakes.map(x => [x.id,x])),Object.fromEntries(cloud.mistakes.map(x => [x.id,x])))),
    sessions: Object.values(record(Object.fromEntries(base.sessions.map(x => [x.id,x])),Object.fromEntries(local.sessions.map(x => [x.id,x])),Object.fromEntries(cloud.sessions.map(x => [x.id,x])))),
    completedTopicIds: topicSet(base.completedTopicIds,local.completedTopicIds,cloud.completedTopicIds),
  };
}

/** Import missing rows or apply a serialized delta. All writes and deletes carry the signed-in user's ID. */
export async function importLocalProgress(user: User, state: ProgressState, overwriteExisting = false, previous?: ProgressState): Promise<void> {
  const uid = user.id;
  const changed = <T extends Row>(rows: T[], prior: T[], key: (row: T) => string) => {
    if (!previous) return rows;
    const old = new Map(prior.map((row) => [key(row),JSON.stringify(row)]));
    return rows.filter((row) => old.get(key(row)) !== JSON.stringify(row));
  };
  const problemRows = (source: ProgressState) => Object.entries(source.problemProgress).map(([question_id,p]) => ({ user_id:uid, question_id, is_solved:['Solved','Mastered'].includes(p.status), status:p.status, attempt_count:p.attemptCount, outcome:p.outcome ?? null, last_attempted:timestamp(p.lastAttempted), last_solved:timestamp(p.lastSolved), completed_at:p.completedAt ?? null, time_spent_min:p.timeSpentMin, notes:p.notes ?? null, revision_schedule:p.revisionSchedule, attempt_undo:p.attemptUndo ? { attempted_at:p.attemptUndo.attemptedAt, previous_count:p.attemptUndo.previousCount, previous_status:p.attemptUndo.previousStatus, previous_last_attempted:p.attemptUndo.previousLastAttempted } : null }));
  const videoRows = (source: ProgressState) => Object.values(source.videoProgress).map(v => ({ user_id:uid, video_id:v.videoId, watched:v.watched, date_watched:timestamp(v.dateWatched), notes:v.notes ?? null }));
  const activityRows = (source: ProgressState) => Object.values(source.dailyActivity).map(d => ({ user_id:uid, date:d.date, study_min:d.studyMin, problems_solved:d.problemsSolved, videos_watched:d.videosWatched }));
  const taskRows = (source: ProgressState) => Object.entries(source.taskCompletionsToday).flatMap(([date,ids]) => ids.map(task_id => ({ user_id:uid,date,task_id })));
  const planRows = (source: ProgressState) => Object.values(source.dailyPlans).map(p => ({ user_id:uid,date:p.date,tasks:p.tasks.map(toSnakeTask),total_estimated_min:p.totalEstimatedMin,daily_budget_min:p.dailyBudgetMin }));
  const up = changed(problemRows(state), previous ? problemRows(previous) : [], r => r.question_id);
  const videos = changed(videoRows(state), previous ? videoRows(previous) : [], r => r.video_id);
  const activity = changed(activityRows(state), previous ? activityRows(previous) : [], r => r.date);
  const tasks = changed(taskRows(state), previous ? taskRows(previous) : [], r => `${r.date}\u0000${r.task_id}`);
  const plans = changed(planRows(state), previous ? planRows(previous) : [], r => r.date);
  const preferences = { user_id:uid, name:state.preferences.name, weekly_hours_target:state.preferences.weeklyHoursTarget, study_days_per_week:state.preferences.studyDaysPerWeek, preferred_study_time:state.preferences.preferredStudyTime, current_level:state.preferences.currentLevel, difficulty_preference:state.preferences.difficultyPreference, theme:state.preferences.theme, revision_intervals:state.preferences.revisionIntervals, min_minutes_for_streak:state.preferences.minMinutesForStreak, onboarded:state.preferences.onboarded };
  const planner = { user_id:uid, daily_budget_min:state.plannerPreferences.dailyBudgetMin, preferred_topic_ids:state.plannerPreferences.preferredTopicIds, difficulty_preference:state.plannerPreferences.difficultyPreference };
  const previousPreferences = previous ? [{ user_id:uid, name:previous.preferences.name, weekly_hours_target:previous.preferences.weeklyHoursTarget, study_days_per_week:previous.preferences.studyDaysPerWeek, preferred_study_time:previous.preferences.preferredStudyTime, current_level:previous.preferences.currentLevel, difficulty_preference:previous.preferences.difficultyPreference, theme:previous.preferences.theme, revision_intervals:previous.preferences.revisionIntervals, min_minutes_for_streak:previous.preferences.minMinutesForStreak, onboarded:previous.preferences.onboarded }] : [];
  const previousPlanner = previous ? [{ user_id:uid, daily_budget_min:previous.plannerPreferences.dailyBudgetMin, preferred_topic_ids:previous.plannerPreferences.preferredTopicIds, difficulty_preference:previous.plannerPreferences.difficultyPreference }] : [];
  const preferenceRows = changed([preferences],previousPreferences,r => r.user_id);
  const plannerRows = changed([planner],previousPlanner,r => r.user_id);
  const batches: [string, Row[], string][] = [
    ['user_progress',up,'user_id,question_id'], ['video_progress',videos,'user_id,video_id'], ['daily_activity',activity,'user_id,date'], ['task_completions',tasks,'user_id,date,task_id'], ['daily_plans',plans,'user_id,date'], ['preferences',preferenceRows,'user_id'], ['planner_preferences',plannerRows,'user_id'],
  ];
  for (const [table, rows, onConflict] of batches) if (rows.length) assert(await (supabase.from(table) as any).upsert(rows,{onConflict,ignoreDuplicates:!overwriteExisting}));
  if (state.currentTopicId && (!previous || state.currentTopicId !== previous.currentTopicId)) assert(await (supabase.from('current_topic') as any).upsert({ user_id:uid,topic_id:state.currentTopicId },{onConflict:'user_id',ignoreDuplicates:!overwriteExisting}));
  const newTopics = previous ? state.completedTopicIds.filter(topic_id => !previous.completedTopicIds.includes(topic_id)) : state.completedTopicIds;
  if (newTopics.length) assert(await (supabase.from('completed_topics') as any).upsert(newTopics.map(topic_id => ({user_id:uid,topic_id})),{onConflict:'user_id,topic_id',ignoreDuplicates:!overwriteExisting}));
  if (!previous || JSON.stringify(state.streak) !== JSON.stringify(previous.streak)) assert(await (supabase.from('streaks') as any).upsert({user_id:uid,current:state.streak.current,longest:state.streak.longest,last_active_date:state.streak.lastActiveDate ?? null},{onConflict:'user_id',ignoreDuplicates:!overwriteExisting}));
  // These tables have no natural key; deterministic user-scoped UUIDs make repeated writes idempotent.
  {
    const stableId = (id: string, prefix: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : stableUuid(`${uid}:${prefix}:${id}`);
    const mistakeRows = (source: ProgressState) => Promise.all(source.mistakes.map(async m => ({id:await stableId(m.id,'m'),user_id:uid,problem_id:m.problemId,type:m.type,note:m.note ?? null,date:timestamp(m.date) ?? new Date().toISOString()})));
    const sessionRows = (source: ProgressState) => Promise.all(source.sessions.map(async s => ({id:await stableId(s.id,'s'),user_id:uid,date:timestamp(s.date) ?? new Date().toISOString(),minutes:s.minutes,topic_id:s.topicId ?? null,problem_ids:s.problemIds ?? [],video_ids:s.videoIds ?? []})));
    const [mistakesAll,sessionsAll,oldMistakes,oldSessions] = await Promise.all([mistakeRows(state),sessionRows(state),previous ? mistakeRows(previous) : [],previous ? sessionRows(previous) : []]);
    const mistakes = changed(mistakesAll,oldMistakes,r => r.id);
    const sessions = changed(sessionsAll,oldSessions,r => r.id);
    if (mistakes.length) assert(await (supabase.from('mistakes') as any).upsert(mistakes,{onConflict:'id',ignoreDuplicates:!overwriteExisting}));
    if (sessions.length) assert(await (supabase.from('sessions') as any).upsert(sessions,{onConflict:'id',ignoreDuplicates:!overwriteExisting}));
  }
  if (previous && overwriteExisting) {
    const removeMissing = async (table: string, column: string, before: string[], after: string[]) => {
      const keep = new Set(after);
      const removed = before.filter((key) => !keep.has(key));
      if (removed.length) assert(await (supabase.from(table) as any).delete().eq('user_id',uid).in(column,removed));
    };
    await removeMissing('user_progress','question_id',Object.keys(previous.problemProgress),Object.keys(state.problemProgress));
    await removeMissing('video_progress','video_id',Object.keys(previous.videoProgress),Object.keys(state.videoProgress));
    await removeMissing('daily_activity','date',Object.keys(previous.dailyActivity),Object.keys(state.dailyActivity));
    await removeMissing('daily_plans','date',Object.keys(previous.dailyPlans),Object.keys(state.dailyPlans));
    await removeMissing('completed_topics','topic_id',previous.completedTopicIds,state.completedTopicIds);
    const activeTasks = new Set(Object.entries(state.taskCompletionsToday).flatMap(([date,ids]) => ids.map((id) => `${date}\u0000${id}`)));
    for (const [date,ids] of Object.entries(previous.taskCompletionsToday)) for (const taskId of ids) {
      if (!activeTasks.has(`${date}\u0000${taskId}`)) assert(await (supabase.from('task_completions') as any).delete().eq('user_id',uid).eq('date',date).eq('task_id',taskId));
    }
    if (previous.currentTopicId && !state.currentTopicId) assert(await (supabase.from('current_topic') as any).delete().eq('user_id',uid));
    const id = (kind: string, value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? Promise.resolve(value) : stableUuid(`${uid}:${kind}:${value}`);
    await removeMissing('mistakes','id',await Promise.all(previous.mistakes.map(x => id('m',x.id))),await Promise.all(state.mistakes.map(x => id('m',x.id))));
    await removeMissing('sessions','id',await Promise.all(previous.sessions.map(x => id('s',x.id))),await Promise.all(state.sessions.map(x => id('s',x.id))));
  }
}

async function stableUuid(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  const raw = [...new Uint8Array(digest).slice(0,16)].map((byte) => byte.toString(16).padStart(2,'0')).join('').split('');
  raw[12]='5'; raw[16]='8';
  const hex=raw.join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
