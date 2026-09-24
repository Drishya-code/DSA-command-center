// ─────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Unknown';

export type Platform = 'LeetCode' | 'GFG' | 'Codeforces' | 'CSES' | 'Other';

export type ProblemStatus = 'Not Started' | 'Attempted' | 'Solved' | 'Needs Revision' | 'Mastered';

export type TopicStatus = 'Not Started' | 'In Progress' | 'Completed';

export type OutcomeType = 'Solved independently' | 'Needed solution' | 'Could not solve';

export type MistakeType = 'Logic error' | 'Edge case' | 'Complexity' | 'Concept' | 'Syntax';

export type RevisionRating = 'Remembered' | 'Forgot';

export type PreferredStudyTime = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export type CurrentLevel = 'Beginner' | 'Beginner-Intermediate' | 'Intermediate' | 'Advanced';

export type Theme = 'dark' | 'light';

// ─────────────────────────────────────────────────────────────────────────
// Roadmap content (static data — src/data/*)
// ─────────────────────────────────────────────────────────────────────────

export interface Topic {
  id: string;
  title: string;
  description: string;
  /** Rough hours budgeted to fully clear this topic (videos + problems). */
  estimatedHours: number;
  /** Position in the Striver A2Z roadmap order. */
  order: number;
  /** Link to TakeUForward topic page */
  tufUrl?: string;
  /** Link to YouTube video for this topic */
  youtubeUrl?: string;
}

export interface Problem {
  id: string;
  topicId: string;
  title: string;
  subtopic: string;
  difficulty: Difficulty;
  platform: Platform;
  /** Primary problem destination from the source repository. */
  url: string;
  /** Verified alternate destinations from the source repository. */
  tufUrl?: string;
  gfgUrl?: string;
  leetcodeUrl?: string;
  videoUrl?: string;
  articleUrl?: string;
  premium?: boolean;
  /** Estimated minutes to solve, used for daily-budget scheduling. */
  estimatedTime: number;
  order: number;
}

export interface Video {
  id: string;
  topicId: string;
  title: string;
  creator: string;
  durationMin: number;
  url: string;
  order: number;
  topicUrl?: string;
  playlistUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// User progress (persisted state — src/data/defaultState.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  onboarded: boolean;
  name: string;
  weeklyHoursTarget: number;
  studyDaysPerWeek: number;
  preferredStudyTime: PreferredStudyTime;
  currentLevel: CurrentLevel;
  difficultyPreference: Difficulty[];
  theme: Theme;
  /** Days-out offsets for spaced revision, e.g. [1, 7, 30]. */
  revisionIntervals: number[];
  /** Minimum minutes studied in a day for it to count toward the streak. */
  minMinutesForStreak: number;
}

export interface RevisionEntry {
  date: string; // ISO yyyy-MM-dd
  done: boolean;
  rating?: RevisionRating;
}

export interface ProblemProgress {
  problemId: string;
  status: ProblemStatus;
  attemptCount: number;
  revisionSchedule: RevisionEntry[];
  timeSpentMin: number;
  outcome?: OutcomeType;
  lastAttempted?: string;
  lastSolved?: string;
  notes?: string;
}

export interface VideoProgress {
  videoId: string;
  watched: boolean;
  dateWatched?: string;
  notes?: string;
}

export interface MistakeLogEntry {
  id: string;
  problemId: string;
  date: string;
  type: MistakeType;
  note?: string;
}

export interface StudySession {
  id: string;
  date: string;
  minutes: number;
  topicId?: string;
  problemIds?: string[];
  videoIds?: string[];
}

export interface DailyActivity {
  date: string;
  studyMin: number;
  problemsSolved: number;
  videosWatched: number;
}

export interface StreakState {
  current: number;
  longest: number;
  lastActiveDate?: string;
}

export interface ProgressState {
  preferences: UserPreferences;
  videoProgress: Record<string, VideoProgress>;
  problemProgress: Record<string, ProblemProgress>;
  mistakes: MistakeLogEntry[];
  sessions: StudySession[];
  dailyActivity: Record<string, DailyActivity>;
  streak: StreakState;
  completedTopicIds: string[];
  currentTopicId: string | null;
  /** taskId[] completed today, keyed by ISO date. */
  taskCompletionsToday: Record<string, string[]>;
  schemaVersion: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Derived / computed (src/utils/analytics.ts, src/utils/scheduler.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface TopicStats {
  topic: Topic;
  totalVideos: number;
  watchedVideos: number;
  totalProblems: number;
  solvedProblems: number;
  masteredProblems: number;
  remainingProblems: number;
  revisionDue: number;
  progressPct: number;
  status: TopicStatus;
  estimatedHoursRemaining: number;
}

export interface WeakTopic {
  topicId: string;
  topicTitle: string;
  score: number;
  reasons: string[];
}

export type ScheduledTaskKind = 'revision' | 'video' | 'problem' | 'review';

export interface ScheduledTask {
  id: string;
  kind: ScheduledTaskKind;
  title: string;
  subtitle?: string;
  topicId: string;
  topicTitle?: string;
  difficulty?: Difficulty;
  estimatedMin: number;
  refId: string;
  url?: string;
  priorityLabel: string;
  priorityRank: number;
}

export interface DayPlan {
  date: string;
  tasks: ScheduledTask[];
  totalEstimatedMin: number;
  dailyBudgetMin: number;
}
