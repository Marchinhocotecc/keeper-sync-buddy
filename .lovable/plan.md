

# Fix: Risposta LLM troncata per max_tokens insufficiente

## Diagnosi

L'analisi semantica FUNZIONA. Il modello `deepseek/deepseek-r1-0528:free` capisce correttamente le frasi multi-intent e produce JSON strutturato. Ma il parametro `max_tokens: 1000` e` troppo basso: il JSON per 3-4 items con tutti i campi richiede circa 1500-2000 token. La risposta viene tagliata a meta e il parser JSON fallisce.

Inoltre, i modelli `deepseek/deepseek-r1:free` e `deepseek/deepseek-chat:free` restituiscono 404 ("No endpoints found"), quindi la fallback chain non serve a nulla con quei nomi.

## Piano (2 modifiche, stesso file)

### 1. Aumentare max_tokens da 1000 a 2500

In `analyzeCore.ts`, cambiare:
```
max_tokens: 1000
```
in:
```
max_tokens: 2500
```

Questo garantisce spazio sufficiente per JSON con 4-5 items completi + tag `<think>` che il modello R1 genera.

### 2. Aggiornare la fallback chain con modelli che esistono davvero

I due modelli che danno 404 vanno sostituiti. I modelli free attualmente disponibili su OpenRouter per DeepSeek sono:
- `deepseek/deepseek-r1-0528:free` (funzionante, confermato dai log)
- `deepseek/deepseek-chat-v3-0324:free` (alternativa chat)
- `google/gemini-2.0-flash-exp:free` (backup non-DeepSeek)

La nuova chain:
```typescript
const FALLBACK_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "google/gemini-2.0-flash-exp:free",
];
```

### File modificato

Solo `supabase/functions/ai-free-chat/analyzeCore.ts`:
- Riga con `max_tokens: 1000` diventa `max_tokens: 2500`
- Array `FALLBACK_MODELS` aggiornato con modelli esistenti
- Nessun altro cambiamento

### Risultato atteso

La frase "sabato spesa, domani lavoro alle 10 e dopodomani vado a sciare e spendo 50" produrra un JSON completo con 3-4 items, non troncato, e il parser lo leggerà correttamente.

