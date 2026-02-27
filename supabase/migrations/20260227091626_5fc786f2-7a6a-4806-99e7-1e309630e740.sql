
-- Weekly summaries persistence
CREATE TABLE public.weekly_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_weekly_summaries_user_week ON public.weekly_summaries (user_id, week_start);

CREATE POLICY "Users can view own weekly summaries" ON public.weekly_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weekly summaries" ON public.weekly_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own weekly summaries" ON public.weekly_summaries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own weekly summaries" ON public.weekly_summaries FOR DELETE USING (auth.uid() = user_id);

-- Monthly summaries persistence
CREATE TABLE public.monthly_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_summaries ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_monthly_summaries_user_month ON public.monthly_summaries (user_id, month, year);

CREATE POLICY "Users can view own monthly summaries" ON public.monthly_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monthly summaries" ON public.monthly_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monthly summaries" ON public.monthly_summaries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own monthly summaries" ON public.monthly_summaries FOR DELETE USING (auth.uid() = user_id);
