-- Create requests_log table for AI assistant monitoring
CREATE TABLE IF NOT EXISTS public.requests_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  prompt TEXT NOT NULL,
  response_time INTEGER, -- in milliseconds
  status_code INTEGER NOT NULL,
  error_message TEXT,
  cached BOOLEAN DEFAULT false,
  endpoint TEXT DEFAULT 'assistant-ai'
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_requests_log_user_id ON public.requests_log(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_log_timestamp ON public.requests_log(timestamp DESC);

-- Enable RLS
ALTER TABLE public.requests_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own logs
CREATE POLICY "Users can view own request logs"
  ON public.requests_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can insert logs (for edge function)
CREATE POLICY "Service role can insert logs"
  ON public.requests_log
  FOR INSERT
  WITH CHECK (true);