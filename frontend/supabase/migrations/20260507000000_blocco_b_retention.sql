-- ============================================================
-- Blocco B — Retention Loops
-- Adds:
--   1. daily_checkins table (evening check-in answers)
--   2. settings columns for new notification preferences
-- IMPORTANT: apply manually via `supabase db push` OR
-- copy/paste in Supabase Studio SQL editor.
-- ============================================================

-- 1. daily_checkins table
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  expenses_logged boolean NOT NULL DEFAULT false,
  tasks_done boolean NOT NULL DEFAULT false,
  mood_ok boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_day UNIQUE (user_id, date)
);

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkins"
ON public.daily_checkins FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checkins"
ON public.daily_checkins FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checkins"
ON public.daily_checkins FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own checkins"
ON public.daily_checkins FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date
ON public.daily_checkins(user_id, date DESC);

-- 2. New settings columns (with safe defaults)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS notify_evening_checkin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_evening_checkin_time text DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS notify_weekly_recap boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_weekly_recap_time text DEFAULT '19:00';
