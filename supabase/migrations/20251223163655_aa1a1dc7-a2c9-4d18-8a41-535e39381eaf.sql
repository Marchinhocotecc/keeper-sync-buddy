-- Create assistant_state table for conversational memory
CREATE TABLE public.assistant_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_intent text NOT NULL DEFAULT 'NONE',
  intent_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_action_type text NOT NULL DEFAULT 'NONE',
  last_action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assistant_state ENABLE ROW LEVEL SECURITY;

-- Users can read their own state
CREATE POLICY "Users can view own assistant state"
ON public.assistant_state
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own state
CREATE POLICY "Users can insert own assistant state"
ON public.assistant_state
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own state
CREATE POLICY "Users can update own assistant state"
ON public.assistant_state
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own state
CREATE POLICY "Users can delete own assistant state"
ON public.assistant_state
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for performance
CREATE INDEX idx_assistant_state_updated_at ON public.assistant_state(updated_at DESC);