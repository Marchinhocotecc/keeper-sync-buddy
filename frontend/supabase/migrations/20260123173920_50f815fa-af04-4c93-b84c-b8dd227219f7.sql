-- FASE 0.2: Consolidamento database LUMI
-- Elimina tabelle ridondanti e unifica lo stato assistente

-- 1. Elimina tabella tasks (legacy - usiamo solo todos)
DROP TABLE IF EXISTS public.tasks;

-- 2. Aggiungi colonna messages a assistant_state per unificare con assistant_memory
ALTER TABLE public.assistant_state 
ADD COLUMN IF NOT EXISTS messages jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Migra i messaggi esistenti da assistant_memory a assistant_state
INSERT INTO public.assistant_state (user_id, messages)
SELECT user_id, messages FROM public.assistant_memory
ON CONFLICT (user_id) 
DO UPDATE SET messages = EXCLUDED.messages;

-- 4. Elimina tabella assistant_memory (ora ridondante)
DROP TABLE IF EXISTS public.assistant_memory;

-- 5. Elimina tabella user_context (funzionalità non utilizzata)
DROP TABLE IF EXISTS public.user_context;