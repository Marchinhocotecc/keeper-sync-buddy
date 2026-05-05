-- Fix requests_log: restrict insert to service_role only
DROP POLICY IF EXISTS "Service role can insert logs" ON public.requests_log;
CREATE POLICY "Service role can insert logs"
ON public.requests_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Lock down ai_cache writes from clients (service role bypasses RLS anyway)
CREATE POLICY "No client inserts on ai_cache"
ON public.ai_cache
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "No client updates on ai_cache"
ON public.ai_cache
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false);

CREATE POLICY "No client deletes on ai_cache"
ON public.ai_cache
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);

-- Fix mutable search_path on function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;