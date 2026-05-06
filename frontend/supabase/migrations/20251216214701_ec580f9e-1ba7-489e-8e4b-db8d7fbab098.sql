-- Add notification preferences columns to settings table
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS notify_tasks boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_calendar boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_daily_focus boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_wellbeing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_focus_time text DEFAULT '08:30',
ADD COLUMN IF NOT EXISTS notify_wellbeing_time text DEFAULT '20:30',
ADD COLUMN IF NOT EXISTS notify_task_before_minutes integer DEFAULT 60;

-- Create a table to track scheduled notifications (for deduplication)
CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL, -- 'task', 'event', 'daily_focus', 'wellbeing'
  reference_id uuid, -- task_id or event_id
  scheduled_time timestamp with time zone NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  shown boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_notification UNIQUE (user_id, type, reference_id, scheduled_time)
);

-- Enable RLS
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for scheduled_notifications
CREATE POLICY "Users can view own notifications"
ON public.scheduled_notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
ON public.scheduled_notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
ON public.scheduled_notifications
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
ON public.scheduled_notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user_time 
ON public.scheduled_notifications(user_id, scheduled_time, shown);