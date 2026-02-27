

# Piano: Intelligence Engine Completo per Ayvro

## Stato attuale

**Cosa esiste gia:**
- L0-L6 pipeline (signals, risk, profile, projection, advisor, insight card)
- Chat via edge function `ai-free-chat` con intent classification
- `FinancialInsightCard` proattiva nella Home
- `financialState.ts` con `monthlySnapshots` persistenti

**Cosa manca:**

## Task 1: Chat finanziaria consapevole — inviare signals + context

Il frontend (`AssistantPanel.tsx`) attualmente invia solo `{ userMessage, userId, locale }`. La chat non ha accesso ai segnali finanziari.

### Modifiche:
- **`AssistantPanel.tsx`**: prima di ogni messaggio, calcolare `financialSignals` e `riskResult` usando le funzioni esistenti, e inviarli nel body:
  ```
  { userMessage, locale, financialContext: { signals, risk, timeframe, userIntentType } }
  ```
- **`aiFreeOrchestrator.ts`**: stessa cosa quando chiama la edge function
- **`ai-free-chat/index.ts`**: nel percorso normale (non `__FINANCIAL_ADVICE__`), leggere `financialContext` dal body e passarlo ad `analyzeCore` come contesto aggiuntivo
- **`ai-free-chat/analyzeCore.ts`**: aggiungere i segnali finanziari al system prompt cosi l'LLM puo interpretarli senza ricalcolarli

### Output strutturato:
- La edge function deve restituire `{ summary, reasoning, actions[] }` per i messaggi finanziari
- `AssistantPanel.tsx` deve renderizzare il nuovo formato (reasoning collassabile, action buttons cliccabili)

## Task 2: Tabelle persistenza summary

Migrazione SQL per creare:

```text
weekly_summaries
├── id (uuid, PK)
├── user_id (uuid, NOT NULL)
├── week_start (date)
├── week_end (date)
├── summary_json (jsonb)
├── created_at (timestamptz)
UNIQUE(user_id, week_start)

monthly_summaries
├── id (uuid, PK)
├── user_id (uuid, NOT NULL)
├── month (integer)
├── year (integer)
├── summary_json (jsonb)
├── created_at (timestamptz)
UNIQUE(user_id, month, year)
```

RLS: `auth.uid() = user_id` per SELECT, INSERT, UPDATE, DELETE.

## Task 3: Weekly Summary Engine

- **`src/services/weeklySummaryService.ts`**: servizio deterministico che:
  - Calcola spesa ultimi 7 giorni vs 7 giorni precedenti
  - Identifica categoria dominante
  - Identifica giorni piu critici (top 2 per spesa)
  - Genera 1 suggerimento prioritario concreto (non generico)
  - Salva in `weekly_summaries`
  - Struttura: `{ totalSpent, previousWeekSpent, variance, dominantCategory, criticalDays, strategicAction }`

- **`src/hooks/useWeeklySummary.ts`**: hook che controlla se esiste summary per settimana corrente, altrimenti lo genera

- **`src/components/WeeklySummaryCard.tsx`**: card minimalista (palette Ayvro, max 3 blocchi info)

## Task 4: Monthly Summary Engine

- **`src/services/monthlySummaryService.ts`**: servizio deterministico che:
  - Calcola budget rispettato si/no
  - Identifica picco di spesa (giorno + importo)
  - Calcola variazione vs mese precedente (%)
  - Genera 1 azione strategica concreta e specifica (es. "Riduci ristoranti del 15%")
  - Salva in `monthly_summaries`

- **`src/hooks/useMonthlySummary.ts`**: hook che controlla se esiste summary per mese precedente completato

- **`src/components/MonthlySummaryCard.tsx`**: card con max 4 blocchi informativi

## Task 5: Memory contestuale dell'assistente

La chat deve avere accesso a:
- Ultimo weekly summary generato
- Ultimo monthly summary
- Ultimo riskLevel
- Ultima azione proposta

### Implementazione:
- Quando la chat invia `financialContext`, includere anche `lastWeeklySummary` e `lastMonthlySummary` (letti dalle tabelle)
- L'edge function li include nel prompt come contesto storico
- Questo rende la chat "stateful advisor" invece di "stateless"

## Task 6: Priorita di insight nella Home

Definire gerarchia per evitare "home rumorosa":

```text
1. Critical risk      → sempre visibile
2. Monthly summary    → visibile primo accesso del mese
3. Weekly summary     → visibile primo accesso della settimana
4. Soft warnings      → solo se nessun altro insight attivo
```

### Implementazione:
- **`src/hooks/useHomeInsights.ts`**: orchestratore che decide quale insight mostrare, massimo 2 contemporanei
- **`HomePage.tsx`**: usa `useHomeInsights` invece di mostrare tutto

## Task 7: Event-driven trigger

Il flusso attuale e `UI → Hook → Calcolo`. Il flusso target e:
`Expense recorded → Signals recalculated → Risk evaluated → Insight updated`

### Implementazione pratica (senza infrastruttura event bus):
- In `ActionEngine.ts`, dopo `recordExpense` con successo, invalidare la query React Query dei financial insights
- Usare `queryClient.invalidateQueries` per triggerare il ricalcolo
- Stesso pattern per `createTask` e `deleteAllExpenses`

## Riepilogo file da creare/modificare

### Nuovi file:
1. `src/services/weeklySummaryService.ts`
2. `src/services/monthlySummaryService.ts`
3. `src/hooks/useWeeklySummary.ts`
4. `src/hooks/useMonthlySummary.ts`
5. `src/hooks/useHomeInsights.ts`
6. `src/components/WeeklySummaryCard.tsx`
7. `src/components/MonthlySummaryCard.tsx`

### File da modificare:
8. `src/components/AssistantPanel.tsx` — inviare financialContext + renderizzare output strutturato
9. `src/assistant/aiFreeOrchestrator.ts` — inviare financialContext
10. `supabase/functions/ai-free-chat/index.ts` — ricevere e usare financialContext nel percorso chat normale
11. `supabase/functions/ai-free-chat/analyzeCore.ts` — includere segnali nel prompt
12. `src/pages/HomePage.tsx` — usare useHomeInsights con priorita
13. `src/engine/ActionEngine.ts` — trigger invalidazione dopo write actions
14. Migrazione SQL — tabelle weekly/monthly_summaries con RLS

