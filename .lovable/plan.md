

# Fix Assistente + Traduzioni

## Problemi Identificati

### P1: Settings crash — colonna `updated_at` mancante
La tabella `settings` non ha la colonna `updated_at`, ma `settingsService.ts` (riga 121) e `AssistantPanel.tsx` (riga 122) la scrivono, causando errore PGRST204 ad ogni cambio lingua/tema.

### P2: Locale hardcoded `"it"` nel client
- `AssistantPanel.tsx` riga 182: `locale: "it"` — sempre italiano indipendentemente dalla lingua dell'utente
- `aiFreeOrchestrator.ts` riga 200: `locale: 'it'` — idem

### P3: Stringhe hardcoded in inglese nell'AssistantPanel
- Welcome text (righe 308-310): "Your Assistant", "I'm here to help you..."
- Default suggestions (righe 72-76): "What should I focus on today?", "Show tasks", etc.
- Fallback messages (righe 192, 229): "Connection issue", "Something went wrong"
- Quick action buttons (righe 429-449): "📋 Tasks", "📅 Events", "➕ New task"
- Clear button (riga 286): "Clear"

### P4: Stringhe hardcoded in italiano nell'aiFreeOrchestrator (client-side)
- Messaggi di conferma/cancellazione/errore tutti in italiano (righe 290, 305, 319, etc.)
- Suggerimenti "Sì"/"No" hardcoded

### P5: L'LLM (analyzeCore) non riceve istruzione sulla lingua di risposta
Il system prompt di `analyzeCore.ts` dice "Detect the user's language. Keep all text fields in that language" — ma è solo per il parsing. Le risposte template del responder usano `userLang` correttamente, ma la lingua viene dalla tabella `settings` che ha il bug `updated_at`.

### P6: `LANGUAGE_NAMES` incompleto nella edge function
`state.ts` riga 240: solo 5 lingue mappate (it, en, es, fr, de). Mancano le altre 17.

---

## Piano di Implementazione

### Task 1: Aggiungere colonna `updated_at` alla tabella `settings`
- Migrazione SQL: `ALTER TABLE settings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now()`
- Questo risolve immediatamente il crash al cambio lingua

### Task 2: Passare la lingua corretta dal client alla edge function
- **`AssistantPanel.tsx`**: leggere `i18n.language` e passarlo come `locale` nella chiamata a `ai-free-chat`
- **`aiFreeOrchestrator.ts`**: leggere `i18n.language` e passarlo come `locale`

### Task 3: Internazionalizzare l'AssistantPanel
- Aggiungere chiavi i18n mancanti per: welcome title/subtitle, suggestions, fallback messages, quick action labels, clear button
- Aggiornare tutti i 22 file di traduzione con le nuove chiavi
- Sostituire tutte le stringhe hardcoded con `t('assistant.xxx')`

### Task 4: Internazionalizzare l'aiFreeOrchestrator (client-side)
- Importare `i18n` e usare `t()` per i messaggi di conferma/cancellazione/errore
- Oppure: delegare completamente alla edge function (che già gestisce le lingue via `responder.ts`)

### Task 5: Completare `LANGUAGE_NAMES` nella edge function
- Aggiungere tutte le 22 lingue supportate alla mappa in `state.ts`

### Task 6: Istruire l'LLM a rispondere nella lingua dell'utente
- Passare `userLang` al prompt di `analyzeCore.ts` come parametro
- Aggiungere al system prompt: "Respond in {language}" per le risposte conversazionali
- Oppure: dato che `analyzeCore` produce solo JSON strutturato e le risposte vengono dal `responder.ts`, assicurarsi che il `responder` copra tutti i casi

### Riepilogo file da modificare
1. **Migrazione SQL** — aggiungere `updated_at` a `settings`
2. **`src/services/settingsService.ts`** — nessuna modifica (già scrive `updated_at`, ora la colonna esisterà)
3. **`src/components/AssistantPanel.tsx`** — passare `i18n.language` come locale, internazionalizzare tutte le stringhe
4. **`src/assistant/aiFreeOrchestrator.ts`** — usare i18n per le risposte client-side
5. **`supabase/functions/ai-free-chat/state.ts`** — completare `LANGUAGE_NAMES`
6. **`src/i18n/locales/*.json`** (22 file) — aggiungere chiavi assistant mancanti
7. **`supabase/functions/ai-free-chat/index.ts`** — assicurarsi che `userLang` venga passato a tutte le risposte

