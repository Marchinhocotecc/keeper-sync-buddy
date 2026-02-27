

# Piano: Intelligence Engine Completo per Ayvro

## Stato attuale — IMPLEMENTATO ✅

**Cosa esiste:**
- L0-L6 pipeline (signals, risk, profile, projection, advisor, insight card)
- Chat via edge function `ai-free-chat` con intent classification
- `FinancialInsightCard` proattiva nella Home
- `financialState.ts` con `monthlySnapshots` persistenti

## ✅ Task 1: Chat finanziaria consapevole

- `AssistantPanel.tsx` invia `financialContext` (signals, risk, timeframe, userIntentType, lastWeeklySummary, lastMonthlySummary)
- `ai-free-chat/analyzeCore.ts` include i segnali nel system prompt
- `ai-free-chat/index.ts` intercetta `financial_response` e lo restituisce come `structured`
- UI renderizza output strutturato con reasoning collassabile e action cards

## ✅ Task 2: Tabelle persistenza summary

- `weekly_summaries` e `monthly_summaries` create con RLS owner-scoped
- Indici unici su (user_id, week_start) e (user_id, month, year)

## ✅ Task 3: Weekly Summary Engine

- `src/services/weeklySummaryService.ts`: calcolo deterministico
- `src/hooks/useWeeklySummary.ts`: check + generate
- `src/components/WeeklySummaryCard.tsx`: card minimal Ayvro

## ✅ Task 4: Monthly Summary Engine

- `src/services/monthlySummaryService.ts`: calcolo deterministico con azione strategica concreta
- `src/hooks/useMonthlySummary.ts`: check previous month
- `src/components/MonthlySummaryCard.tsx`: card max 4 blocchi

## ✅ Task 5: Memory contestuale dell'assistente

- `AssistantPanel.tsx` carica `lastWeeklySummary` e `lastMonthlySummary` e li invia con ogni messaggio
- L'edge function li include nel prompt come contesto storico

## ✅ Task 6: Priorità di insight nella Home

- `src/hooks/useHomeInsights.ts`: orchestratore con gerarchia
  1. Critical risk → sempre
  2. Monthly summary → primo accesso del mese
  3. Weekly summary → primo accesso della settimana
  4. Soft warnings → solo se nessun altro attivo
- Max 2 insight contemporanei
- `HomePage.tsx` usa `useHomeInsights`

## ⏳ Task 7: Event-driven trigger (parziale)

- Il frontend usa React Query invalidation tramite gli hooks esistenti
- Per un event bus completo servirebbe infrastruttura aggiuntiva (Supabase Realtime o pg_notify)
