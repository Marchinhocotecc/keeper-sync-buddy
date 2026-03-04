

## Piano: Architettura Multi-Prompt Specializzata (7 Moduli)

### Situazione Attuale

La edge function `ai-free-chat` usa un singolo prompt monolitico in `analyzeCore.ts` che fa tutto: classificazione intenti, analisi finanziaria, e estrazione dati. Il `financialAdvisor.ts` è separato ma viene chiamato solo per il bypass `__FINANCIAL_ADVICE__`. Weekly/Monthly summaries sono già deterministici (niente LLM). Non esiste un conversational brain separato ne un translator.

### Architettura Proposta

Ristrutturiamo la edge function in 7 moduli LLM specializzati, ognuno con un prompt dedicato e minimale:

```text
Messaggio utente
      │
      ▼
  ┌─────────────────┐
  │ 1. INTENT        │  ← LLM ultra-leggero (solo label)
  │    CLASSIFIER     │
  └────────┬──────────┘
           │
     ┌─────┴──────────────────────────┐
     │              │                  │
     ▼              ▼                  ▼
FINANCIAL_*    TASK/EVENT/PLANNING   GENERAL_CHAT
     │              │                  │
     ▼              │                  ▼
┌──────────┐        │           ┌──────────────┐
│2. DECISION│       │           │3. CONVERSA-  │
│  ENGINE   │       │           │   TIONAL     │
│(JSON only)│       │           │   BRAIN      │
└─────┬─────┘       │           └──────────────┘
      │              │
      ▼              ▼
┌──────────┐    Router deterministico
│4. TRANS- │    (esistente)
│  LATOR   │
└──────────┘

Proattivi (trigger-based, non in-chat):
┌──────────┐  ┌──────────┐  ┌──────────┐
│5. WEEKLY │  │6. MONTHLY│  │7. PROAC- │
│  SUMMARY │  │  SUMMARY │  │  TIVITY  │
└──────────┘  └──────────┘  └──────────┘
```

### Modifiche Dettagliate

#### 1. Nuovo file: `supabase/functions/ai-free-chat/intentClassifier.ts`
- Prompt ultra-minimale: riceve messaggio, ritorna SOLO una label (`FINANCIAL_DECISION`, `FINANCIAL_QUERY`, `TASK_QUERY`, `EVENT_QUERY`, `PLANNING`, `GENERAL_CHAT`, `UNKNOWN`)
- Usa `google/gemini-2.5-flash-lite` via Lovable AI (o il modello free OpenRouter esistente) con `max_tokens: 20`, `temperature: 0`
- Fallback: se il classifier fallisce, usa il `deterministicRouter` esistente per mappare

#### 2. Nuovo file: `supabase/functions/ai-free-chat/decisionEngine.ts`
- Si attiva SOLO per `FINANCIAL_DECISION` e `FINANCIAL_QUERY`
- Riceve i segnali pre-calcolati (da `financialSignals`/`riskEngine`)
- Ritorna JSON strutturato: `{ summary, reasoning, actions[] }`
- Sostituisce la logica finanziaria attualmente inline in `analyzeCore.ts`
- Fallback deterministico già esistente in `financialAdvisor.ts` → riusato

#### 3. Nuovo file: `supabase/functions/ai-free-chat/conversationalBrain.ts`
- Si attiva per `GENERAL_CHAT`, `PLANNING`, e come "traduttore" per risposte finanziarie
- Prompt: naturale, conciso, non genera JSON, non inventa numeri
- Riceve contesto conversazionale e dati pre-calcolati se disponibili

#### 4. Integrato in `conversationalBrain.ts` (funzione `translateDecision`)
- Trasforma output JSON del Decision Engine in risposta naturale
- Nessun LLM aggiuntivo: è una funzione del Conversational Brain con prompt dedicato

#### 5-6. `supabase/functions/ai-free-chat/weeklySummaryLLM.ts` e `monthlySummaryLLM.ts`
- Wrappano i dati deterministici esistenti (`weeklySummaryService.ts`, `monthlySummaryService.ts`)
- Aggiungono un layer LLM opzionale per generare JSON strutturato come specificato nei prompt
- Chiamati proattivamente (non in-chat), solo quando servono i riassunti

#### 7. Nuovo file: `supabase/functions/ai-free-chat/proactiveMonitor.ts`
- Trigger: chiamato quando cambia il `riskLevel` (da `riskEngine.ts`)
- Input: risk_increase/risk_decrease
- Output: JSON `{ trigger, message, micro_action }`
- Integrato nel flusso proattivo esistente (`DailyNudge`, `FinancialInsightCard`)

#### Modifica principale: `supabase/functions/ai-free-chat/index.ts`
- Il flusso diventa:
  1. Normalize (invariato)
  2. Cancel/Confirm/UIAction (invariato)
  3. **Intent Classifier** (sostituisce la chiamata diretta ad `analyzeCore`)
  4. Routing basato sulla label:
     - `FINANCIAL_*` → Decision Engine → Translator → risposta
     - `TASK_QUERY`/`EVENT_QUERY` → Router deterministico (invariato)
     - `PLANNING`/`GENERAL_CHAT` → Conversational Brain
     - `UNKNOWN` → fallback al router deterministico, poi `analyzeCore` come ultima risorsa
  5. Per creazione task/eventi → il router deterministico e `analyzeCore` restano come fallback

#### `analyzeCore.ts` → ridotto
- Non è più il punto d'ingresso principale
- Viene chiamato SOLO come fallback quando Intent Classifier dice `UNKNOWN` e il router deterministico non matcha
- Il prompt viene semplificato (rimuovere tutta la parte finanziaria, che ora è nel Decision Engine)

### Impatto sul Client

Nessuna modifica necessaria su `aiFreeOrchestrator.ts` - il contratto API (`AIResponse`) resta identico. Il client continua a ricevere `{ reply, intent, action, needsConfirmation, ... }`.

### Provider AI

Il progetto usa attualmente OpenRouter con modelli free. Le nuove chiamate useranno lo stesso provider. L'Intent Classifier userà il modello più leggero disponibile (`max_tokens: 20`). Il Decision Engine e Conversational Brain useranno il modello standard.

### Rischi e Mitigazioni

- **Latenza**: l'Intent Classifier aggiunge una chiamata LLM. Mitigato da `max_tokens: 20` e modello leggero
- **Rate limits**: più chiamate per messaggio finanziario (classifier + decision + translator). Mitigato: per TASK/EVENT il classifier è l'unica chiamata LLM (il resto è deterministico)
- **Backward compatibility**: il contratto API non cambia, il client non viene toccato

