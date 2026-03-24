

## Piano: Terminology & Routing Synchronization

### Analisi del Codice Attuale

Il flusso attuale in `index.ts` e' gia' corretto architetturalmente: LLM Classifier → Switch deterministico. I problemi reali sono:

1. **Router query patterns (righe 367-378)** troppo stretti: solo `mostra|vedi|lista|elenco|quali|quanti` + `task|attivita`. "che task ho oggi?" non matcha.
2. **Router ha greeting/help handlers (righe 380-398)** che non vengono mai raggiunti (il classifier li gestisce prima) ma creano confusione.
3. **Classifier fallback deterministico** (`intentClassifier.ts`) ha gli stessi pattern stretti — se l'LLM fallisce, cade in UNKNOWN.
4. **Logging insufficiente** — non si vede quale modulo gestisce il messaggio.
5. **Nessuna terminologia centralizzata** — i sinonimi sono duplicati tra classifier, router e responder.

### Modifiche

#### 1. Nuovo file: `supabase/functions/ai-free-chat/terminology.ts`

Mappa centralizzata di sinonimi per TASK, EVENT, EXPENSE. Usata sia dal classifier fallback che dal router. Contiene pattern regex pre-compilati per ogni categoria. Copre italiano, inglese, e varianti naturali ("che task ho", "ho eventi", "i miei impegni", etc.).

#### 2. `intentClassifier.ts` — Usare terminology map nel fallback

Importare i pattern da `terminology.ts` in `classifyDeterministic`. Eliminare i pattern inline duplicati. Il fallback diventa piu' ampio senza duplicare codice.

#### 3. `router.ts` — Espandere query patterns + rimuovere greeting/help

- **Righe 367-378**: Importare pattern da `terminology.ts` per TASK_QUERY, EVENT_QUERY, QUERY_BUDGET
- **Righe 380-398**: Rimuovere greeting e help handlers (gia' gestiti dal classifier → Brain)
- I pattern di creazione restano invariati (funzionano)

#### 4. `index.ts` — Aggiungere logging dettagliato

Dopo ogni routing decision, loggare:
```
[Ayvro] INPUT: "che task ho oggi"
[Ayvro] INTENT: TASK_QUERY
[Ayvro] ROUTED_TO: DB_QUERY
```

Gia' parzialmente presente ma incompleto.

#### 5. `conversationalBrain.ts` — Fallback migliorato

Il fallback attuale e' gia' stato migliorato nell'ultima iterazione. Verificare che non contenga "Puoi specificare meglio?" e che proponga opzioni concrete: "Posso aiutarti con task, eventi, spese o pianificazione. A cosa ti riferisci?"

### File Modificati

- **Nuovo**: `supabase/functions/ai-free-chat/terminology.ts` — mappa centralizzata
- **Modifica**: `supabase/functions/ai-free-chat/intentClassifier.ts` — usa terminology nel fallback
- **Modifica**: `supabase/functions/ai-free-chat/router.ts` — espandi query patterns, rimuovi greeting/help
- **Modifica**: `supabase/functions/ai-free-chat/index.ts` — logging migliorato
- **Verifica**: `supabase/functions/ai-free-chat/conversationalBrain.ts` — confermare fallback

### Nessuna Modifica al Client

Il contratto API resta identico. Non creo file in `src/` perche' la terminology serve solo nella edge function (il client non fa routing).

