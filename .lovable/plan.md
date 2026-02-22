

# Piano: Rate Limiting per Utente + Caching Intelligente

## 1. Rate Limiting (Edge Function)

### Dove agisce
Il rate limiter viene inserito nella Edge Function `ai-free-chat/index.ts`, subito dopo l'autenticazione e **prima** di qualsiasi chiamata LLM (Layer 1). Questo blocca la richiesta prima che raggiunga OpenRouter.

### Logica
- Conta le righe in `ai_requests` per lo `user_id` nelle ultime 24 ore
- FREE: max 10 messaggi AI/giorno (solo le chiamate che arrivano al Layer 1 - Analyze contano; greeting, cancel, confirm, query NON contano)
- PREMIUM: 200/giorno (soft cap, per ora tutti sono FREE)
- Se il limite e' superato, restituisce un messaggio chiaro senza chiamare OpenRouter

### Implementazione
- Nuova funzione `checkRateLimit(supabase, userId)` in `state.ts`
- Query: `SELECT count(*) FROM ai_requests WHERE user_id = $1 AND created_at > now() - interval '24 hours'`
- Inserimento in `ai_requests` avviene solo quando si chiama effettivamente l'LLM (riga ~327 di index.ts, prima di `analyzeMessage`)
- Il check avviene nella stessa posizione, prima del Layer 1

### Cosa cambia nei file
**`supabase/functions/ai-free-chat/state.ts`**: aggiunta funzione `checkRateLimit` e `logAIRequest`

**`supabase/functions/ai-free-chat/index.ts`**: 
- Prima del commento `=== LAYER 1: ANALYZE ===` (riga ~322), inserire:
  1. `checkRateLimit()` - se superato, ritorna errore
  2. `logAIRequest()` - se passato, registra la richiesta
- Greeting, cancel, confirm, slot-filling, query NON passano per il rate limiter (sono gia' gestiti prima del Layer 1)

---

## 2. Caching Intelligente (Edge Function)

### Dove agisce
Il cache si inserisce tra il rate limit check e la chiamata LLM (Layer 1). Usa la tabella `ai_cache` gia' esistente.

### Logica
- Hash SHA-256 del messaggio normalizzato (lowercase, trim, senza punteggiatura extra)
- Prima di chiamare `analyzeMessage()`, cerca in `ai_cache` un risultato con lo stesso hash creato nelle ultime 24 ore
- Se trovato: restituisce il risultato cached senza chiamare OpenRouter e senza consumare rate limit
- Se non trovato: chiama LLM, salva il risultato in `ai_cache`

### Cosa viene cachato
- Messaggi identici o quasi identici tra utenti diversi (es. "mostra i miei task" ha sempre la stessa analisi strutturale)
- Il cache e' globale (non per utente) perche' l'analisi LLM e' indipendente dall'utente - estrae solo intent/struttura
- TTL: 24 ore (i risultati vecchi vengono ignorati)

### Cosa NON viene cachato
- Query che dipendono dal contesto utente (i dati utente sono caricati DOPO l'analisi)
- Greeting e cancel (gia' gestiti senza LLM)
- Risposte con errori

### Policy RLS mancante
La tabella `ai_cache` non ha policy INSERT. Serve aggiungere una policy per permettere l'inserimento dalla Edge Function (che usa service_role_key, quindi bypassa RLS). Nessuna migrazione necessaria: il service role key bypassa RLS.

### Implementazione
**`supabase/functions/ai-free-chat/state.ts`**: aggiunta funzioni `getCachedAnalysis` e `setCachedAnalysis`

**`supabase/functions/ai-free-chat/index.ts`**:
- Prima di `analyzeMessage()`, check cache
- Dopo `analyzeMessage()` con successo, salva in cache
- Se cache hit: skip rate limit increment (non ha consumato OpenRouter)

---

## Schema dei file modificati

| File | Modifica |
|------|----------|
| `supabase/functions/ai-free-chat/state.ts` | +4 funzioni: `checkRateLimit`, `logAIRequest`, `getCachedAnalysis`, `setCachedAnalysis` |
| `supabase/functions/ai-free-chat/index.ts` | +~25 righe prima del Layer 1: rate limit check, cache check, cache save, request log |

Nessuna migrazione database necessaria (tabelle `ai_requests` e `ai_cache` esistono gia').

---

## Flusso risultante

```text
Messaggio utente
    |
[Auth]
    |
[Layer 0: Normalize]
    |
[Greeting/Cancel/Confirm/Query?] --> risposta diretta (no LLM, no rate limit)
    |
[Rate Limit Check] --> superato? --> "Hai raggiunto il limite giornaliero"
    |
[Cache Check] --> hit? --> usa risultato cached (no LLM call)
    |
[Log AI Request] (conta nel rate limit)
    |
[Layer 1: Analyze (LLM)]
    |
[Cache Save] (salva risultato per richieste future)
    |
[Layer 2-6: Validate, Confirm, Execute, Respond]
```

---

## Dettaglio tecnico: costanti

```text
FREE_DAILY_LIMIT = 10
PREMIUM_DAILY_LIMIT = 200
CACHE_TTL_HOURS = 24
```

Il limite di 10 messaggi AI/giorno per FREE e' calibrato per:
- 1000 utenti attivi = max 10.000 chiamate OpenRouter/giorno
- Con cache ~30% hit rate = ~7.000 chiamate effettive
- Ampiamente sotto i limiti dei modelli free (~20 req/min)

