-- Add awaiting_confirmation and attempts columns to assistant_state table
ALTER TABLE public.assistant_state 
ADD COLUMN IF NOT EXISTS awaiting_confirmation boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

-- Create index on user_id for fast lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_assistant_state_user_id ON public.assistant_state(user_id);

-- Comment on columns for documentation
COMMENT ON COLUMN public.assistant_state.awaiting_confirmation IS 'Whether the assistant is awaiting confirmation (sì/no) from the user';
COMMENT ON COLUMN public.assistant_state.attempts IS 'Number of attempts for current intent - used for anti-loop protection';