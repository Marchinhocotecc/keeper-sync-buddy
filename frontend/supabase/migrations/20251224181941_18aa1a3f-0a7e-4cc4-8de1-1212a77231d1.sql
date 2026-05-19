-- Step 1: Elimina duplicati in settings, mantiene solo la riga più recente per ogni user_id
-- Usa ctid come fallback se created_at non esiste o è NULL
WITH ranked_settings AS (
  SELECT ctid,
         user_id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id 
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) as rn
  FROM public.settings
  WHERE user_id IS NOT NULL
)
DELETE FROM public.settings
WHERE ctid IN (
  SELECT ctid FROM ranked_settings WHERE rn > 1
);

-- Step 2: Aggiungi vincolo UNIQUE su user_id
ALTER TABLE public.settings 
ADD CONSTRAINT settings_user_id_unique UNIQUE (user_id);