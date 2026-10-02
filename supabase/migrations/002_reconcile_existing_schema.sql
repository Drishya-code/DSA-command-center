-- DSA Command Center: additive reconciliation for the audited partial schema.
--
-- The supplied remote audit reports 13 existing public tables with RLS, no
-- foreign keys, six missing policies, and a missing current_topic timestamp
-- trigger. This migration adds only those objects. It does not drop, replace,
-- or weaken existing objects, and does not alter or delete table data.
--
-- Run this entire file as one script in Supabase SQL Editor. All changes and
-- the in-transaction verification queries are enclosed in one transaction.
-- If the editor stops on an error before COMMIT, the transaction is uncommitted;
-- issue ROLLBACK in that same session (or close the session) before retrying.

BEGIN;

-- Add or confirm the 13 user ownership foreign keys from migration 001.
-- An existing FK on the expected source column (or with the expected name)
-- must have the exact source column, target auth.users(id), and CASCADE delete
-- action. Any mismatch, missing table/column, or duplicate relationship raises
-- an error; the transaction then rolls back instead of skipping or replacing it.
DO $migration$
DECLARE
  r RECORD;
  source_table REGCLASS;
  auth_users REGCLASS := 'auth.users'::regclass;
  source_attnum SMALLINT;
  users_id_attnum SMALLINT;
  found_count INTEGER;
  correct_count INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('profiles', 'id', 'profiles_id_fkey'),
      ('user_progress', 'user_id', 'user_progress_user_id_fkey'),
      ('video_progress', 'user_id', 'video_progress_user_id_fkey'),
      ('mistakes', 'user_id', 'mistakes_user_id_fkey'),
      ('sessions', 'user_id', 'sessions_user_id_fkey'),
      ('daily_activity', 'user_id', 'daily_activity_user_id_fkey'),
      ('streaks', 'user_id', 'streaks_user_id_fkey'),
      ('completed_topics', 'user_id', 'completed_topics_user_id_fkey'),
      ('current_topic', 'user_id', 'current_topic_user_id_fkey'),
      ('task_completions', 'user_id', 'task_completions_user_id_fkey'),
      ('daily_plans', 'user_id', 'daily_plans_user_id_fkey'),
      ('planner_preferences', 'user_id', 'planner_preferences_user_id_fkey'),
      ('preferences', 'user_id', 'preferences_user_id_fkey')
    ) AS expected(table_name, source_column, constraint_name)
  LOOP
    source_table := to_regclass(format('public.%I', r.table_name));
    IF source_table IS NULL THEN
      RAISE EXCEPTION 'Expected table public.% is missing', r.table_name;
    END IF;

    SELECT attnum INTO source_attnum
    FROM pg_attribute
    WHERE attrelid = source_table AND attname = r.source_column
      AND NOT attisdropped;
    SELECT attnum INTO users_id_attnum
    FROM pg_attribute
    WHERE attrelid = auth_users AND attname = 'id'
      AND NOT attisdropped;
    IF source_attnum IS NULL OR users_id_attnum IS NULL THEN
      RAISE EXCEPTION 'Expected FK column public.%.% or auth.users.id is missing',
        r.table_name, r.source_column;
    END IF;

    SELECT count(*), count(*) FILTER (
      WHERE conkey = ARRAY[source_attnum]::smallint[]
        AND confrelid = auth_users
        AND confkey = ARRAY[users_id_attnum]::smallint[]
        AND confdeltype = 'c'
        AND convalidated
    )
    INTO found_count, correct_count
    FROM pg_constraint
    WHERE conrelid = source_table AND contype = 'f'
      AND (conname = r.constraint_name
        OR conkey @> ARRAY[source_attnum]::smallint[]);

    IF found_count = 0 THEN
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users (id) ON DELETE CASCADE',
        source_table, r.constraint_name, r.source_column
      );
    ELSIF found_count = 1 AND correct_count = 1 THEN
      -- A correct FK already exists; preserve it, including its existing name.
      NULL;
    ELSE
      RAISE EXCEPTION
        'Foreign key mismatch on public.% (expected % -> auth.users(id) ON DELETE CASCADE); inspect the existing constraint and reconcile manually',
        r.table_name, r.source_column;
    END IF;
  END LOOP;
END
$migration$;

-- Add only the six missing policies listed in the supplied audit. For an
-- existing same-named policy, verify command and normalized ownership
-- expressions first; preserve a correct policy and abort on a mismatch.
DO $migration$
DECLARE
  r RECORD;
  existing_command TEXT;
  existing_using TEXT;
  existing_check TEXT;
  existing_roles NAME[];
  existing_permissive TEXT;
  expected_using TEXT := 'auth.uid() = user_id';
  found_policy BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('completed_topics', 'Users can update own completed topics', 'UPDATE'),
      ('current_topic', 'Users can delete own current topic', 'DELETE'),
      ('planner_preferences', 'Users can delete own planner preferences', 'DELETE'),
      ('preferences', 'Users can delete own preferences', 'DELETE'),
      ('streaks', 'Users can delete own streak', 'DELETE'),
      ('task_completions', 'Users can update own task completions', 'UPDATE')
    ) AS expected(table_name, policy_name, policy_command)
  LOOP
    SELECT cmd, qual, with_check, roles, permissive
    INTO existing_command, existing_using, existing_check,
      existing_roles, existing_permissive
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = r.table_name
      AND policyname = r.policy_name;
    found_policy := FOUND;

    IF found_policy THEN
      IF existing_command <> r.policy_command
        OR existing_roles <> ARRAY['public']::name[]
        OR existing_permissive <> 'PERMISSIVE'
        OR regexp_replace(coalesce(existing_using, ''), '[[:space:]()]', '', 'g')
          <> regexp_replace(expected_using, '[[:space:]()]', '', 'g')
        OR (r.policy_command = 'UPDATE'
          AND regexp_replace(coalesce(existing_check, ''), '[[:space:]()]', '', 'g')
            <> regexp_replace(expected_using, '[[:space:]()]', '', 'g'))
        OR (r.policy_command = 'DELETE'
          AND coalesce(existing_check, '') <> '')
      THEN
        RAISE EXCEPTION 'Policy public.%.% exists with unexpected command or ownership expressions',
          r.table_name, r.policy_name;
      END IF;
    ELSIF r.policy_command = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
        r.policy_name, r.table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (auth.uid() = user_id)',
        r.policy_name, r.table_name
      );
    END IF;
  END LOOP;
END
$migration$;

-- Require the timestamp function from migration 001 and ensure the trigger is
-- BEFORE UPDATE FOR EACH ROW and calls that exact function. Abort on a conflict.
DO $migration$
DECLARE
  trigger_function OID := to_regprocedure('public.update_updated_at_column()');
  existing_trigger RECORD;
BEGIN
  IF trigger_function IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = trigger_function AND prorettype = 'trigger'::regtype
  ) THEN
    RAISE EXCEPTION 'Expected trigger function public.update_updated_at_column() is missing or has the wrong return type';
  END IF;

  SELECT tgfoid, tgtype, tgenabled
  INTO existing_trigger
  FROM pg_trigger
  WHERE tgrelid = 'public.current_topic'::regclass
    AND tgname = 'update_current_topic_updated_at'
    AND NOT tgisinternal;

  IF FOUND THEN
    IF existing_trigger.tgfoid <> trigger_function
      OR existing_trigger.tgtype <> 19
      OR existing_trigger.tgenabled NOT IN ('O', 'A')
    THEN
      RAISE EXCEPTION 'Trigger public.update_current_topic_updated_at exists but does not use the expected enabled BEFORE UPDATE FOR EACH ROW function';
    END IF;
  ELSE
    CREATE TRIGGER update_current_topic_updated_at
      BEFORE UPDATE ON public.current_topic
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$migration$;

-- Assert the completed state before commit. A failed assertion aborts the
-- transaction, so none of the additions are partially committed.
DO $migration$
DECLARE
  r RECORD;
  source_table REGCLASS;
  auth_users REGCLASS := 'auth.users'::regclass;
  source_attnum SMALLINT;
  users_id_attnum SMALLINT;
  found_count INTEGER;
  correct_count INTEGER;
  actual_count INTEGER;
BEGIN
  -- Check each expected ownership relationship independently. A total count
  -- could hide a missing FK offset by an unrelated or duplicate constraint.
  FOR r IN
    SELECT * FROM (VALUES
      ('profiles', 'id', 'profiles_id_fkey'),
      ('user_progress', 'user_id', 'user_progress_user_id_fkey'),
      ('video_progress', 'user_id', 'video_progress_user_id_fkey'),
      ('mistakes', 'user_id', 'mistakes_user_id_fkey'),
      ('sessions', 'user_id', 'sessions_user_id_fkey'),
      ('daily_activity', 'user_id', 'daily_activity_user_id_fkey'),
      ('streaks', 'user_id', 'streaks_user_id_fkey'),
      ('completed_topics', 'user_id', 'completed_topics_user_id_fkey'),
      ('current_topic', 'user_id', 'current_topic_user_id_fkey'),
      ('task_completions', 'user_id', 'task_completions_user_id_fkey'),
      ('daily_plans', 'user_id', 'daily_plans_user_id_fkey'),
      ('planner_preferences', 'user_id', 'planner_preferences_user_id_fkey'),
      ('preferences', 'user_id', 'preferences_user_id_fkey')
    ) AS expected(table_name, source_column, constraint_name)
  LOOP
    source_table := to_regclass(format('public.%I', r.table_name));
    IF source_table IS NULL THEN
      RAISE EXCEPTION 'Expected table public.% is missing during FK assertion', r.table_name;
    END IF;

    SELECT attnum INTO source_attnum
    FROM pg_attribute
    WHERE attrelid = source_table AND attname = r.source_column
      AND NOT attisdropped;
    SELECT attnum INTO users_id_attnum
    FROM pg_attribute
    WHERE attrelid = auth_users AND attname = 'id'
      AND NOT attisdropped;
    IF source_attnum IS NULL OR users_id_attnum IS NULL THEN
      RAISE EXCEPTION 'Expected FK column public.%.% or auth.users.id is missing during FK assertion',
        r.table_name, r.source_column;
    END IF;

    SELECT count(*), count(*) FILTER (
      WHERE conkey = ARRAY[source_attnum]::smallint[]
        AND confrelid = auth_users
        AND confkey = ARRAY[users_id_attnum]::smallint[]
        AND confdeltype = 'c'
        AND convalidated
    )
    INTO found_count, correct_count
    FROM pg_constraint
    WHERE conrelid = source_table AND contype = 'f'
      AND (conname = r.constraint_name
        OR conkey @> ARRAY[source_attnum]::smallint[]);

    IF found_count <> 1 OR correct_count <> 1 THEN
      RAISE EXCEPTION
        'Expected exactly one validated cascading FK public.%.% -> auth.users(id); found % candidate constraint(s), % correct',
        r.table_name, r.source_column, found_count, correct_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO actual_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions', 'daily_activity', 'streaks', 'completed_topics', 'current_topic', 'task_completions', 'daily_plans', 'planner_preferences', 'preferences');
  IF actual_count <> 51 THEN
    RAISE EXCEPTION 'Expected 51 policies on the 13 application tables; found %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count
  FROM pg_trigger
  WHERE tgrelid = 'public.current_topic'::regclass
    AND tgname = 'update_current_topic_updated_at'
    AND tgfoid = to_regprocedure('public.update_updated_at_column()')
    AND tgtype = 19 AND tgenabled IN ('O', 'A') AND NOT tgisinternal;
  IF actual_count <> 1 THEN
    RAISE EXCEPTION 'Expected one enabled BEFORE UPDATE row trigger on public.current_topic';
  END IF;
END
$migration$;

-- Read-only verification result sets. These run inside the transaction so a
-- SQL error in a verification query also prevents a partial commit.
WITH expected(table_name, source_column, constraint_name) AS (
  VALUES
    ('profiles', 'id', 'profiles_id_fkey'),
    ('user_progress', 'user_id', 'user_progress_user_id_fkey'),
    ('video_progress', 'user_id', 'video_progress_user_id_fkey'),
    ('mistakes', 'user_id', 'mistakes_user_id_fkey'),
    ('sessions', 'user_id', 'sessions_user_id_fkey'),
    ('daily_activity', 'user_id', 'daily_activity_user_id_fkey'),
    ('streaks', 'user_id', 'streaks_user_id_fkey'),
    ('completed_topics', 'user_id', 'completed_topics_user_id_fkey'),
    ('current_topic', 'user_id', 'current_topic_user_id_fkey'),
    ('task_completions', 'user_id', 'task_completions_user_id_fkey'),
    ('daily_plans', 'user_id', 'daily_plans_user_id_fkey'),
    ('planner_preferences', 'user_id', 'planner_preferences_user_id_fkey'),
    ('preferences', 'user_id', 'preferences_user_id_fkey')
), expected_tables AS (
  SELECT e.table_name, e.source_column, e.constraint_name,
         to_regclass(format('public.%I', e.table_name)) AS source_table
  FROM expected e
), expected_columns AS (
  SELECT e.table_name, e.source_column, e.constraint_name,
         e.source_table, a.attnum
  FROM expected_tables e
  LEFT JOIN LATERAL (
    SELECT attnum FROM pg_attribute
    WHERE attrelid = e.source_table
      AND attname = e.source_column AND NOT attisdropped
  ) a ON true
)
SELECT e.table_name, e.source_column, e.constraint_name,
       (e.source_table IS NOT NULL) AS source_table_exists,
       (e.attnum IS NOT NULL) AS source_column_exists,
       coalesce(fk.constraint_count, 0) AS constraint_count,
       fk.actual_constraint_names,
       coalesce(fk.correct_source, false) AS correct_source_column,
       coalesce(fk.references_user_id, false) AS references_auth_users_id,
       coalesce(fk.cascades_delete, false) AS on_delete_cascade,
       coalesce(fk.is_validated, false) AS is_validated,
       (coalesce(fk.constraint_count, 0) = 1
        AND e.source_table IS NOT NULL
        AND e.attnum IS NOT NULL
        AND coalesce(fk.correct_source, false)
        AND coalesce(fk.references_user_id, false)
        AND coalesce(fk.cascades_delete, false)
        AND coalesce(fk.is_validated, false)) AS is_correct
FROM expected_columns e
LEFT JOIN LATERAL (
  SELECT count(*) AS constraint_count,
         string_agg(c.conname::text, ', ' ORDER BY c.conname) AS actual_constraint_names,
         bool_and(c.conkey = ARRAY[e.attnum]::smallint[]) AS correct_source,
         bool_and(c.confrelid = 'auth.users'::regclass
           AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
             WHERE attrelid = 'auth.users'::regclass
               AND attname = 'id' AND NOT attisdropped)]::smallint[]
         ) AS references_user_id,
         bool_and(c.confdeltype = 'c') AS cascades_delete,
         bool_and(c.convalidated) AS is_validated
  FROM pg_constraint c
  WHERE c.conrelid = e.source_table
    AND c.contype = 'f'
    AND (c.conname = e.constraint_name
      OR c.conkey @> ARRAY[e.attnum]::smallint[])
) fk ON true
ORDER BY e.table_name;

SELECT COUNT(*) AS total_application_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'user_progress', 'video_progress', 'mistakes', 'sessions', 'daily_activity', 'streaks', 'completed_topics', 'current_topic', 'task_completions', 'daily_plans', 'planner_preferences', 'preferences');

WITH expected(table_name, policy_name, policy_command, expression) AS (
  VALUES
    ('completed_topics', 'Users can update own completed topics', 'UPDATE', 'auth.uid() = user_id'),
    ('current_topic', 'Users can delete own current topic', 'DELETE', 'auth.uid() = user_id'),
    ('planner_preferences', 'Users can delete own planner preferences', 'DELETE', 'auth.uid() = user_id'),
    ('preferences', 'Users can delete own preferences', 'DELETE', 'auth.uid() = user_id'),
    ('streaks', 'Users can delete own streak', 'DELETE', 'auth.uid() = user_id'),
    ('task_completions', 'Users can update own task completions', 'UPDATE', 'auth.uid() = user_id')
)
SELECT e.table_name, e.policy_name, p.cmd, p.qual, p.with_check,
       p.roles, p.permissive,
       (p.policyname IS NOT NULL
        AND p.cmd = e.policy_command
        AND p.roles = ARRAY['public']::name[]
        AND p.permissive = 'PERMISSIVE'
        AND regexp_replace(coalesce(p.qual, ''), '[[:space:]()]', '', 'g') = regexp_replace(e.expression, '[[:space:]()]', '', 'g')
        AND ((e.policy_command = 'UPDATE'
              AND regexp_replace(coalesce(p.with_check, ''), '[[:space:]()]', '', 'g') = regexp_replace(e.expression, '[[:space:]()]', '', 'g'))
          OR (e.policy_command = 'DELETE'
              AND coalesce(p.with_check, '') = ''))
       ) AS is_correct
FROM expected e
LEFT JOIN pg_policies p
  ON p.schemaname = 'public' AND p.tablename = e.table_name
 AND p.policyname = e.policy_name
ORDER BY e.table_name;

SELECT t.tgname, t.tgenabled, t.tgtype, p.proname AS function_name,
       (t.tgfoid = to_regprocedure('public.update_updated_at_column()')
        AND t.tgtype = 19 AND t.tgenabled IN ('O', 'A')) AS is_correct
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.current_topic'::regclass
  AND t.tgname = 'update_current_topic_updated_at'
  AND NOT t.tgisinternal;

COMMIT;
