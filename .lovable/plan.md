

## Piano: Fix Definitivo Routing — LLM Classifier come Fonte Principale

### Problemi Confermati nel Codice

1. **ADVICE guardrail (righe 394-406)** intercetta messaggi come "cosa faccio oggi" PRIMA del classifier LLM
2. **Greeting check (riga 387-392)** intercetta "come va", "come stai" prima del classifier
3. **Pattern multilingua nei deterministici** non scalano (solo italiano/inglese)
4. **Decision Engine** usa un unico template, non differenzia tra "posso permettermi", "come sto andando", "sto spendendo troppo"
5. **Conversational Brain fallback** risponde sempre "Puoi specificare meglio?"
6. **Memoria conversazionale** esiste ma il follow-up bypass è troppo stretto (solo pattern esatti)

### Modifiche

#### 1. `index.ts` — LLM Classifier diventa fonte principale

**Rimuovere completamente:**
- Blocco ADVICE guardrail (righe 394-406)
- Blocco greeting check (righe 387-392)

**Nuovo flusso dopo slot filling:**
```
Follow-up check → bypass al Brain con memoria
      ↓ (se non follow-up)
Rate limit check
      ↓
LLM Intent Classifier (UNICA fonte di verità)
      ↓
Switch deterministico per intent label
```

Il greeting sarà gestito dal classifier (`GENERAL_CHAT`) → Conversational Brain. L'advice sarà gestito dal classifier (`PLANNING`/`GENERAL_CHAT`) → Conversational Brain.

**Percorso UNKNOWN migliorato:**
- Provare router deterministico SOLO per pattern di creazione (`crea|aggiungi|ricordami|devo|€`)
- Se non matcha → Conversational Brain direttamente (NON analyzeCore)
- `analyzeCore` rimane solo come estremo fallback per entity extraction su messaggi di creazione

#### 2. `intentClassifier.ts` — Pattern deterministici solo come fallback

I pattern deterministici restano ma servono SOLO quando l'LLM fallisce (timeout, no API key, errore). Non vengono mai chiamati prima dell'LLM.

Nessuna espansione multilingua dei pattern — l'LLM gestisce tutte le lingue nativamente.

#### 3. `index.ts` — Memoria minima obbligatoria

La struttura `{ lastIntent, lastUserMessage, lastAssistantResponse }` esiste già. Migliorare il follow-up detection:

- Espandere `isFollowUp` con pattern più ampi (non solo esatti: anche "ma perché dici questo?", "cosa intendi con...")
- Passare la memoria SEMPRE al Conversational Brain (già fatto, verificare consistenza)
- Se follow-up e lastIntent era FINANCIAL → includere il reasoning del decision engine precedente nel contesto

#### 4. `decisionEngine.ts` — Risposte differenziate per tipo di domanda

Aggiungere al prompt del Decision Engine la classificazione della domanda:

- **"posso permettermi X"** → risposta decisionale (SI/NO + condizione): aggiungere campo `decision_type: 'affordability'` nel prompt, forzare output con `verdict: "si/no"` + `condition`
- **"come sto andando"** → risposta analitica: `decision_type: 'status_report'`, focus su trend e proiezione
- **"sto spendendo troppo"** → risposta diagnostica: `decision_type: 'diagnostic'`, focus su categoria dominante e confronto

Modificare `buildDeterministicDecision` per rilevare il tipo di domanda dal `userMessage` e generare risposte differenziate invece di un unico template basato solo sul riskLevel.

#### 5. `conversationalBrain.ts` — Eliminare fallback generici

**Riscrivere `getFallbackReply`:**
- Se `memory.lastIntent` contiene FINANCIAL → "Vuoi che approfondisca l'analisi delle spese o hai una domanda specifica?"
- Se `memory.lastIntent` contiene TASK → "Vuoi che ti aiuti a organizzare i task?"
- Se `memory.lastIntent` contiene EVENT → "Hai bisogno di gestire un evento?"
- Default (nessuna memoria) → "Come posso aiutarti? Posso gestire task, eventi e spese."

**Bloccare completamente** la frase "Puoi specificare meglio?" — sostituita con domande contestuali.

**Migliorare prompt BRAIN** per PLANNING: aggiungere istruzione esplicita di proporre orari concreti e suggerimenti basati sugli eventi/task già presenti.

#### 6. `router.ts` — Ridurre scope a sola creazione

I query pattern (righe 367-378) NON vengono più usati come prima linea — il classifier LLM li gestisce. Restano solo come fallback nel percorso UNKNOWN per intercettare pattern di creazione espliciti.

### File Modificati

- `supabase/functions/ai-free-chat/index.ts` — rimuovere bypass pre-classifier, semplificare UNKNOWN path
- `supabase/functions/ai-free-chat/intentClassifier.ts` — espandere follow-up patterns
- `supabase/functions/ai-free-chat/decisionEngine.ts` — differenziare risposte per tipo domanda
- `supabase/functions/ai-free-chat/conversationalBrain.ts` — eliminare fallback generici, migliorare PLANNING

### Nessuna Modifica al Client

Il contratto API (`AIResponse`) resta identico.

