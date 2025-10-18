-- Add monthly_budget column to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS monthly_budget numeric DEFAULT 1000;