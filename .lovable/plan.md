

# Fix Modelli AI: GPT-OSS + DeepSeek R1 Fallback

## Azione utente richiesta (PRIMA del deploy)

Vai su **https://openrouter.ai/settings/privacy** e abilita "Allow free model providers to use my data". Senza questo, GPT-OSS-120B:free restituisce 404.

La chiave `sk-or-v1-...` che hai fornito e' una chiave OpenRouter (non specifica per GPT-OSS). Se e' diversa da quella gia' salvata come `OPENROUTER_API_KEY`, la aggiorneremo. Se e' la stessa, non serve cambiarla.

## Modifica codice

**File:** `supabase/functions/ai-free-chat/analyzeCore.ts`

```text
PRIMA:
  "openai/gpt-oss-120b:free",
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-chat-v3-0324:free",

DOPO:
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
```

- Gemini Flash Exp: rimosso (ritirato, 404)
- DeepSeek Chat v3: rimosso (ritirato, 404)
- DeepSeek R1 0528: unico modello DeepSeek free ancora disponibile su OpenRouter

## Nota su DeepSeek R1 come fallback

R1 genera tag `<think>...</think>` nelle risposte. Il codice li gestisce gia':
```
cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
```

Quindi funziona come fallback senza problemi.

## Deploy

Deploy automatico della Edge Function `ai-free-chat` dopo la modifica.

