-- Create ai_requests table for rate limiting and logging
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT DEFAULT 'assistant-ai',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ai_cache table for caching AI responses
CREATE TABLE IF NOT EXISTS public.ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  prompt_hash TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_created ON public.ai_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cache_user_prompt ON public.ai_cache (user_id, prompt_hash);

-- Enable RLS
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_requests
CREATE POLICY "Users can view own ai_requests"
  ON public.ai_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS policies for ai_cache
CREATE POLICY "Users can view own ai_cache"
  ON public.ai_cache
  FOR SELECT
  USING (auth.uid() = user_id);