-- Add INSERT policy to ai_requests table to ensure users can only insert their own requests
CREATE POLICY "Users can insert own ai_requests"
  ON public.ai_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);