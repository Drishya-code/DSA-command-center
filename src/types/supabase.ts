// Supabase database types (generated from migration)
// Use these for type-safe database operations

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Profile {
  id: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  question_id: string;
  is_solved: boolean;
  status: 'Not Started' | 'Attempted' | 'Solved' | 'Needs Revision' | 'Mastered';
  attempt_count: number;
  outcome: 'Solved independently' | 'Needed solution' | 'Could not solve' | null;
  last_attempted: string | null;
  last_solved: string | null;
  completed_at: string | null;
  time_spent_min: number;
  notes: string | null;
  revision_schedule: RevisionEntry[];
  attempt_undo: AttemptUndo | null;
  created_at: string;
  updated_at: string;
}

export interface RevisionEntry {
  date: string;
  done: boolean;
  rating?: 'Remembered' | 'Forgot';
}

export interface AttemptUndo {
  attempted_at: string;
  previous_count: number;
  previous_status: 'Not Started' | 'Attempted' | 'Solved' | 'Needs Revision' | 'Mastered';
  previous_last_attempted?: string;
}

export interface VideoProgress {
  id: string;
  user_id: string;
  video_id: string;
  watched: boolean;
  date_watched: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mistake {
  id: string;
  user_id: string;
  problem_id: string;
  type: 'Logic error' | 'Edge case' | 'Complexity' | 'Concept' | 'Syntax';
  note: string | null;
  date: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  date: string;
  minutes: number;
  topic_id: string | null;
  problem_ids: string[];
  video_ids: string[];
  created_at: string;
}

export interface DailyActivity {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  study_min: number;
  problems_solved: number;
  videos_watched: number;
  created_at: string;
  updated_at: string;
}

export interface Streak {
  user_id: string;
  current: number;
  longest: number;
  last_active_date: string | null;
  updated_at: string;
}

export interface CompletedTopic {
  id: string;
  user_id: string;
  topic_id: string;
  created_at: string;
}

export interface CurrentTopic {
  user_id: string;
  topic_id: string;
  updated_at: string;
}

export interface TaskCompletion {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  task_id: string;
  created_at: string;
}

export interface DailyPlan {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  tasks: ScheduledTask[];
  total_estimated_min: number;
  daily_budget_min: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduledTask {
  id: string;
  kind: 'revision' | 'video' | 'problem' | 'review';
  title: string;
  subtitle?: string;
  topic_id: string;
  topic_title?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard' | 'Unknown';
  estimated_min: number;
  ref_id: string;
  url?: string;
  priority_label: string;
  priority_rank: number;
  reason?: string;
}

export interface PlannerPreferences {
  user_id: string;
  daily_budget_min: number;
  preferred_topic_ids: string[];
  difficulty_preference: ('Easy' | 'Medium' | 'Hard')[];
  updated_at: string;
}

export interface Preferences {
  user_id: string;
  name: string;
  weekly_hours_target: number;
  study_days_per_week: number;
  preferred_study_time: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  current_level: 'Beginner' | 'Beginner-Intermediate' | 'Intermediate' | 'Advanced';
  difficulty_preference: ('Easy' | 'Medium' | 'Hard')[];
  theme: 'dark' | 'light';
  revision_intervals: number[];
  min_minutes_for_streak: number;
  onboarded: boolean;
  updated_at: string;
}