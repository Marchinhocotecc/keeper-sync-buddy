-- Add heart_rate column to wellness_data table
ALTER TABLE wellness_data 
ADD COLUMN IF NOT EXISTS heart_rate integer;