

# Piano: Comportamento Proattivo Immediato

## Cosa manca oggi

1. **Nessun daily nudge** — La Home non mostra il `dailySafeLimit` come frase contestuale al primo accesso
2. **Nessun micro-intervento post-spesa** — Dopo `recordExpense`, niente notifica immediata sullo stato
3. **Nessuna memoria delle azioni suggerite** — Il sistema propone azioni ma non traccia se l'utente le ignora nei giorni successivi
4. **Nessun pattern detection** — Non analizza i giorni ricorrenti ad alta spesa
5. **Le risposte chat sono verbose** — Nessun vincolo di brevità nel prompt dell'edge function

## Implementazione in 5 task

### Task 1: Daily Nudge nella Home

Creare `src/components/DailyNudge.tsx`:
- Componente leggero (1 frase, no card pesante)
- Legge `financialSignals` via `useFinancialInsights` (già calcolati)
- Logica:
  - `riskLevel === "safe"` → "Oggi puoi spendere fino a €{dailySafeLimit} senza alterare il budget."
  - `riskLevel === "warning"` → "Oggi dovresti restare sotto €{dailySafeLimit}."
  - `riskLevel === "critical"` → "Evita nuove spese oggi."
- Mostrato solo 1 volta al giorno (usa `localStorage` con chiave `ayvro_nudge_${date}`)
- Posizione: sopra i Quick Stats in `HomePage.tsx`, prima delle insight cards

### Task 2: Micro-intervento post-spesa (toast contestuale)

Modificare `ActionEngine.ts` — aggiungere un hook wrapper o event emitter:
- Creare `src/hooks/useExpenseReaction.ts`:
  - Dopo ogni `recordExpense` con successo, ricalcola `financialSignals` velocemente
  - Mostra un toast contestuale:
    - Se `burnRate > 0.8` → toast warning: "Stai spendendo più del ritmo medio questa settimana."
    - Se `dailySafeLimit < 10` → toast critical: "Limite giornaliero sotto €10. Attenzione."
    - Se impulse spending detected → "Questa è la {n}ª spesa alta oggi."
  - Integrato dove `recordExpense` viene chiamato (chat + UI)

### Task 3: Memoria azioni suggerite + reminder coerente

Estendere `actionTracker.ts`:
- Aggiungere campo `suggestion` a `ActionEvent` (testo del suggerimento originale, es. "Riduci ristoranti del 20%")
- Creare `getActiveStrategy(userId)` — ritorna l'ultima azione suggerita non ancora completata/ignorata
- In `useFinancialInsights.ts`, prima di generare nuovi insight, controllare:
  - Se c'è una strategia attiva ignorata E l'utente ha registrato spese nella stessa categoria
  - Aggiungere un flag `strategyIgnored: true` + testo al `financialContext` inviato all'LLM
- L'LLM nel prompt riceve: "L'utente sta ignorando la strategia '{suggestion}'. Menzionalo brevemente."

### Task 4: Pattern detection giorni ricorrenti

Creare `src/services/spendingPatterns.ts`:
- Funzione `detectDayPatterns(userId)`:
  - Analizza ultimi 30 giorni di spese
  - Raggruppa per giorno della settimana (0=Dom, 1=Lun, ...)
  - Identifica se un giorno ha media > 1.5x media globale
  - Ritorna: `{ peakDay: string, avgPeakSpending: number, globalAvg: number }` o `null`
- Integrare nel `DailyNudge`:
  - Se `oggi === peakDay` → aggiungere: "Il {giorno} è il tuo giorno di spesa più alto. Vuoi impostare un limite?"

### Task 5: Chat più breve e diretta

Modificare `supabase/functions/ai-free-chat/analyzeCore.ts`:
- Nel system prompt aggiungere vincoli espliciti:
  - "Rispondi in massimo 2-3 frasi."
  - "Niente premesse, niente 'dipende da'."
  - "Proponi sempre un'azione concreta come ultima frase."
  - "Se hai dati sufficienti, dai numeri specifici."
- Aggiungere al prompt il contesto `strategyIgnored` dal Task 3

## File da creare
1. `src/components/DailyNudge.tsx`
2. `src/hooks/useExpenseReaction.ts`
3. `src/services/spendingPatterns.ts`

## File da modificare
4. `src/pages/HomePage.tsx` — aggiungere `DailyNudge` sopra Quick Stats
5. `src/services/actionTracker.ts` — aggiungere `suggestion` field + `getActiveStrategy()`
6. `src/hooks/useFinancialInsights.ts` — passare `strategyIgnored` nel context
7. `supabase/functions/ai-free-chat/analyzeCore.ts` — prompt più diretto + vincolo brevità + strategy awareness
8. `src/components/AssistantPanel.tsx` — dopo invio spesa, triggerare `useExpenseReaction`

