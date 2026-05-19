-- Create function to update timestamps if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create assistant_memory table for storing last 5 conversations
CREATE TABLE public.assistant_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index on user_id (one memory record per user)
CREATE UNIQUE INDEX idx_assistant_memory_user_id ON public.assistant_memory(user_id);

-- Enable RLS
ALTER TABLE public.assistant_memory ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own assistant memory"
  ON public.assistant_memory
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own assistant memory"
  ON public.assistant_memory
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own assistant memory"
  ON public.assistant_memory
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own assistant memory"
  ON public.assistant_memory
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_assistant_memory_updated_at
  BEFORE UPDATE ON public.assistant_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();