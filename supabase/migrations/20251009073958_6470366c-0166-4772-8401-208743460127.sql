-- Add missing columns to wellness_data table
ALTER TABLE public.wellness_data 
ADD COLUMN IF NOT EXISTS steps INTEGER,
ADD COLUMN IF NOT EXISTS meditation_minutes INTEGER;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_wellness_data_user_date ON public.wellness_data(user_id, date DESC);