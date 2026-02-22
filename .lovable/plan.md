

# Cambio Modello AI: GPT-OSS-120B Free

## Cosa cambia

Un solo file: `supabase/functions/ai-free-chat/analyzeCore.ts`

La catena di fallback attuale:
1. deepseek/deepseek-r1-0528:free
2. deepseek/deepseek-chat-v3-0324:free
3. google/gemini-2.0-flash-exp:free

Diventa:
1. **openai/gpt-oss-120b:free** (nuovo primario)
2. google/gemini-2.0-flash-exp:free (fallback)
3. deepseek/deepseek-chat-v3-0324:free (fallback finale)

## Perche' questa sequenza

- GPT-OSS-120B come primario: modello principale richiesto
- Gemini Flash come secondo: veloce e affidabile come backup
- DeepSeek Chat (non R1) come terzo: R1 viene rimosso perche' genera tag `<think>` che complicano il parsing JSON; Chat v3 e' piu' pulito

## Nota sul parsing

Il codice attuale ha gia' la pulizia dei tag `<think>`:
```
cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
```

GPT-OSS-120B non dovrebbe generare tag `<think>`, ma il codice di pulizia resta come protezione.

## API Key

Nessuna nuova chiave necessaria. `OPENROUTER_API_KEY` (gia' configurata) funziona con tutti i modelli OpenRouter, incluso `openai/gpt-oss-120b:free`.

## Dettaglio tecnico

File: `supabase/functions/ai-free-chat/analyzeCore.ts`, riga ~48

```text
PRIMA:
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "google/gemini-2.0-flash-exp:free",

DOPO:
  "openai/gpt-oss-120b:free",
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-chat-v3-0324:free",
```

Deploy automatico della Edge Function dopo la modifica.
