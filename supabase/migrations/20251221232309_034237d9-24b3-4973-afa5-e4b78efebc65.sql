-- Enable RLS on budgets table
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own budgets
CREATE POLICY "Users can view own budgets"
ON public.budgets
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own budgets
CREATE POLICY "Users can insert own budgets"
ON public.budgets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own budgets
CREATE POLICY "Users can update own budgets"
ON public.budgets
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own budgets
CREATE POLICY "Users can delete own budgets"
ON public.budgets
FOR DELETE
USING (auth.uid() = user_id);

-- Add unique constraint to prevent duplicate budget entries per user/month/year
ALTER TABLE public.budgets
ADD CONSTRAINT budgets_user_month_year_unique UNIQUE (user_id, month, year);