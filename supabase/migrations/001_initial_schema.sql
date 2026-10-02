-- DSA Command Center — Complete Supabase Migration
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/adkbngkftxdrrhqrmoms/sql)
-- Execute as a single script or in order.
--
-- ============================================================================
-- PRE-FLIGHT CHECK: Run these queries FIRST to detect any existing objects
-- ============================================================================
-- If any rows are returned, the database is NOT fresh.
-- Do NOT run the full migration if objects exist — use an upgrade migration instead.
-- CREATE TABLE IF NOT EXISTS does NOT modify existing tables (columns, constraints, indexes).
--
-- Check for existing tables:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
--   'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
--   'daily_activity', 'streaks', 'completed_topics', 'current_topic',
--   'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
-- );
--
-- Check for existing policies:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN (
--   'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
--   'daily_activity', 'streaks', 'completed_topics', 'current_topic',
--   'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
-- );
--
-- Check for existing triggers:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
-- WHERE tgrelid::regclass::text LIKE 'public.%'
--   AND tgname IN ('on_auth_user_created', 'update_profiles_updated_at',
--     'update_user_progress_updated_at', 'update_video_progress_updated_at',
--     'update_daily_activity_updated_at', 'update_streaks_updated_at',
--     'update_daily_plans_updated_at', 'update_planner_preferences_updated_at',
--     'update_preferences_updated_at', 'update_current_topic_updated_at');
--
-- Check for existing functions:
-- SELECT proname FROM pg_proc WHERE proname IN ('handle_new_user', 'update_updated_at_column');
--
-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE (auto-created via trigger on auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Secure trigger function: auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING; -- Idempotent: handle re-runs or race conditions
  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert own profile (trigger does this, but allow for completeness)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- NOTE: No DELETE policy on profiles. Other tables reference auth.users(id), not profiles(id).
-- Deleting a profile row does NOT cascade to user data. Account deletion requires
-- a secure server-side Edge Function with service-role key.

-- ============================================================================
-- 2. USER_PROGRESS TABLE (question solve status)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  is_solved BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'Not Started'
    CHECK (status IN ('Not Started', 'Attempted', 'Solved', 'Needs Revision', 'Mastered')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  outcome TEXT CHECK (outcome IN ('Solved independently', 'Needed solution', 'Could not solve')),
  last_attempted TIMESTAMPTZ,
  last_solved TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  time_spent_min INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_min >= 0),
  notes TEXT,
  revision_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempt_undo JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, question_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_question_id ON public.user_progress(question_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_status ON public.user_progress(status);

-- Enable RLS
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- User progress policies
DROP POLICY IF EXISTS "Users can view own progress" ON public.user_progress;
CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own progress" ON public.user_progress;
CREATE POLICY "Users can insert own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own progress" ON public.user_progress;
CREATE POLICY "Users can update own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own progress" ON public.user_progress;
CREATE POLICY "Users can delete own progress"
  ON public.user_progress FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. VIDEO_PROGRESS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.video_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  watched BOOLEAN NOT NULL DEFAULT false,
  date_watched TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_progress_user_id ON public.video_progress(user_id);

ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own video progress" ON public.video_progress;
CREATE POLICY "Users can view own video progress"
  ON public.video_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own video progress" ON public.video_progress;
CREATE POLICY "Users can insert own video progress"
  ON public.video_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own video progress" ON public.video_progress;
CREATE POLICY "Users can update own video progress"
  ON public.video_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own video progress" ON public.video_progress;
CREATE POLICY "Users can delete own video progress"
  ON public.video_progress FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. MISTAKES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Logic error', 'Edge case', 'Complexity', 'Concept', 'Syntax')),
  note TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mistakes_user_id ON public.mistakes(user_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_problem_id ON public.mistakes(problem_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_date ON public.mistakes(date DESC);

ALTER TABLE public.mistakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mistakes" ON public.mistakes;
CREATE POLICY "Users can view own mistakes"
  ON public.mistakes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own mistakes" ON public.mistakes;
CREATE POLICY "Users can insert own mistakes"
  ON public.mistakes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own mistakes" ON public.mistakes;
CREATE POLICY "Users can update own mistakes"
  ON public.mistakes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own mistakes" ON public.mistakes;
CREATE POLICY "Users can delete own mistakes"
  ON public.mistakes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 5. SESSIONS TABLE (study sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  topic_id TEXT,
  problem_ids TEXT[] DEFAULT '{}',
  video_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.sessions(date DESC);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON public.sessions;
CREATE POLICY "Users can view own sessions"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
CREATE POLICY "Users can insert own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
CREATE POLICY "Users can update own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;
CREATE POLICY "Users can delete own sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 6. DAILY_ACTIVITY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL, -- ISO date string stored as DATE
  study_min INTEGER NOT NULL DEFAULT 0 CHECK (study_min >= 0),
  problems_solved INTEGER NOT NULL DEFAULT 0 CHECK (problems_solved >= 0),
  videos_watched INTEGER NOT NULL DEFAULT 0 CHECK (videos_watched >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user_id ON public.daily_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON public.daily_activity(date DESC);

ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily activity" ON public.daily_activity;
CREATE POLICY "Users can view own daily activity"
  ON public.daily_activity FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own daily activity" ON public.daily_activity;
CREATE POLICY "Users can insert own daily activity"
  ON public.daily_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own daily activity" ON public.daily_activity;
CREATE POLICY "Users can update own daily activity"
  ON public.daily_activity FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own daily activity" ON public.daily_activity;
CREATE POLICY "Users can delete own daily activity"
  ON public.daily_activity FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 7. STREAKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0 CHECK (current >= 0),
  longest INTEGER NOT NULL DEFAULT 0 CHECK (longest >= 0),
  last_active_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own streak" ON public.streaks;
CREATE POLICY "Users can view own streak"
  ON public.streaks FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own streak" ON public.streaks;
CREATE POLICY "Users can insert own streak"
  ON public.streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own streak" ON public.streaks;
CREATE POLICY "Users can update own streak"
  ON public.streaks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own streak" ON public.streaks;
CREATE POLICY "Users can delete own streak"
  ON public.streaks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 8. COMPLETED_TOPICS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.completed_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_completed_topics_user_id ON public.completed_topics(user_id);

ALTER TABLE public.completed_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own completed topics" ON public.completed_topics;
CREATE POLICY "Users can view own completed topics"
  ON public.completed_topics FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own completed topics" ON public.completed_topics;
CREATE POLICY "Users can insert own completed topics"
  ON public.completed_topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own completed topics" ON public.completed_topics;
CREATE POLICY "Users can delete own completed topics"
  ON public.completed_topics FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own completed topics" ON public.completed_topics;
CREATE POLICY "Users can update own completed topics"
  ON public.completed_topics FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 9. CURRENT_TOPIC TABLE (single row per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.current_topic (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.current_topic ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own current topic" ON public.current_topic;
CREATE POLICY "Users can view own current topic"
  ON public.current_topic FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own current topic" ON public.current_topic;
CREATE POLICY "Users can insert own current topic"
  ON public.current_topic FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own current topic" ON public.current_topic;
CREATE POLICY "Users can update own current topic"
  ON public.current_topic FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own current topic" ON public.current_topic;
CREATE POLICY "Users can delete own current topic"
  ON public.current_topic FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 10. TASK_COMPLETIONS TABLE (daily task checkboxes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  task_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_user_id ON public.task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON public.task_completions(date DESC);

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own task completions" ON public.task_completions;
CREATE POLICY "Users can view own task completions"
  ON public.task_completions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own task completions" ON public.task_completions;
CREATE POLICY "Users can insert own task completions"
  ON public.task_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own task completions" ON public.task_completions;
CREATE POLICY "Users can update own task completions"
  ON public.task_completions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own task completions" ON public.task_completions;
CREATE POLICY "Users can delete own task completions"
  ON public.task_completions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 11. DAILY_PLANS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_estimated_min INTEGER NOT NULL DEFAULT 0 CHECK (total_estimated_min >= 0),
  daily_budget_min INTEGER NOT NULL DEFAULT 60 CHECK (daily_budget_min > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_user_id ON public.daily_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON public.daily_plans(date DESC);

ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily plans" ON public.daily_plans;
CREATE POLICY "Users can view own daily plans"
  ON public.daily_plans FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own daily plans" ON public.daily_plans;
CREATE POLICY "Users can insert own daily plans"
  ON public.daily_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own daily plans" ON public.daily_plans;
CREATE POLICY "Users can update own daily plans"
  ON public.daily_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own daily plans" ON public.daily_plans;
CREATE POLICY "Users can delete own daily plans"
  ON public.daily_plans FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 12. PLANNER_PREFERENCES TABLE (single row per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.planner_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_budget_min INTEGER NOT NULL DEFAULT 60 CHECK (daily_budget_min > 0),
  preferred_topic_ids TEXT[] DEFAULT '{}',
  difficulty_preference TEXT[] DEFAULT '{"Easy","Medium","Hard"}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.planner_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own planner preferences" ON public.planner_preferences;
CREATE POLICY "Users can view own planner preferences"
  ON public.planner_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own planner preferences" ON public.planner_preferences;
CREATE POLICY "Users can insert own planner preferences"
  ON public.planner_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own planner preferences" ON public.planner_preferences;
CREATE POLICY "Users can update own planner preferences"
  ON public.planner_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own planner preferences" ON public.planner_preferences;
CREATE POLICY "Users can delete own planner preferences"
  ON public.planner_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 13. PREFERENCES TABLE (user preferences - theme, revision intervals, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT DEFAULT '',
  weekly_hours_target INTEGER NOT NULL DEFAULT 11 CHECK (weekly_hours_target BETWEEN 1 AND 60),
  study_days_per_week INTEGER NOT NULL DEFAULT 6 CHECK (study_days_per_week BETWEEN 1 AND 7),
  preferred_study_time TEXT NOT NULL DEFAULT 'Evening'
    CHECK (preferred_study_time IN ('Morning', 'Afternoon', 'Evening', 'Night')),
  current_level TEXT NOT NULL DEFAULT 'Beginner-Intermediate'
    CHECK (current_level IN ('Beginner', 'Beginner-Intermediate', 'Intermediate', 'Advanced')),
  difficulty_preference TEXT[] NOT NULL DEFAULT '{"Easy","Medium","Hard"}',
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  revision_intervals INTEGER[] NOT NULL DEFAULT '{1,7,30}',
  min_minutes_for_streak INTEGER NOT NULL DEFAULT 30 CHECK (min_minutes_for_streak BETWEEN 5 AND 480),
  onboarded BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON public.preferences;
CREATE POLICY "Users can view own preferences"
  ON public.preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON public.preferences;
CREATE POLICY "Users can insert own preferences"
  ON public.preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON public.preferences;
CREATE POLICY "Users can update own preferences"
  ON public.preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own preferences" ON public.preferences;
CREATE POLICY "Users can delete own preferences"
  ON public.preferences FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 14. UPDATED_AT TRIGGERS (auto-update updated_at column)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply to tables with updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_progress_updated_at ON public.user_progress;
CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_video_progress_updated_at ON public.video_progress;
CREATE TRIGGER update_video_progress_updated_at
  BEFORE UPDATE ON public.video_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_activity_updated_at ON public.daily_activity;
CREATE TRIGGER update_daily_activity_updated_at
  BEFORE UPDATE ON public.daily_activity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_streaks_updated_at ON public.streaks;
CREATE TRIGGER update_streaks_updated_at
  BEFORE UPDATE ON public.streaks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_plans_updated_at ON public.daily_plans;
CREATE TRIGGER update_daily_plans_updated_at
  BEFORE UPDATE ON public.daily_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_planner_preferences_updated_at ON public.planner_preferences;
CREATE TRIGGER update_planner_preferences_updated_at
  BEFORE UPDATE ON public.planner_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_preferences_updated_at ON public.preferences;
CREATE TRIGGER update_preferences_updated_at
  BEFORE UPDATE ON public.preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_current_topic_updated_at ON public.current_topic;
CREATE TRIGGER update_current_topic_updated_at
  BEFORE UPDATE ON public.current_topic
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 15. VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================================

-- A. List all 13 tables with RLS status
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled,
  CASE WHEN t.rowsecurity THEN '✅' ELSE '❌' END AS rls_status
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
    'daily_activity', 'streaks', 'completed_topics', 'current_topic',
    'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
  )
ORDER BY t.tablename;

-- B. Policy count per table (profiles has 3 policies - no DELETE; all others have 4 = 51 total)
SELECT
  p.tablename,
  COUNT(*) AS policy_count,
  STRING_AGG(p.cmd, ', ' ORDER BY p.cmd) AS policies
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN (
    'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
    'daily_activity', 'streaks', 'completed_topics', 'current_topic',
    'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
  )
GROUP BY p.tablename
ORDER BY p.tablename;

-- C. Total policy count (should be 51: profiles has 3, others have 4 each)
SELECT COUNT(*) AS total_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
    'daily_activity', 'streaks', 'completed_topics', 'current_topic',
    'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
  );

-- D. Profile creation trigger on auth.users
SELECT
  t.tgname AS trigger_name,
  t.tgrelid::regclass AS table_name,
  p.proname AS function_name,
  t.tgenabled
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgname = 'on_auth_user_created'
  AND t.tgrelid = 'auth.users'::regclass;

-- E. All updated_at triggers
SELECT
  t.tgname AS trigger_name,
  t.tgrelid::regclass AS table_name,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE p.proname = 'update_updated_at_column'
  AND t.tgrelid::regclass::text LIKE 'public.%'
ORDER BY t.tgrelid::regclass::text;

-- F. Foreign key constraints referencing auth.users (13 tables)
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name = 'users'
  AND ccu.table_schema = 'auth'
ORDER BY tc.table_name;

-- G. Unique constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
    'daily_activity', 'streaks', 'completed_topics', 'current_topic',
    'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
  )
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

-- H. Check constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions',
    'daily_activity', 'streaks', 'completed_topics', 'current_topic',
    'task_completions', 'daily_plans', 'planner_preferences', 'preferences'
  )
ORDER BY tc.table_name;

-- I. Test profile trigger (manual test after running migration)
-- INSERT INTO auth.users (id, email, raw_user_meta_data, encrypted_password, email_confirmed_at, created_at, updated_at)
-- VALUES (gen_random_uuid(), 'test@example.com', '{"full_name": "Test User"}', 'hash', now(), now(), now());
-- SELECT * FROM public.profiles WHERE full_name = 'Test User';
-- DELETE FROM auth.users WHERE email = 'test@example.com';