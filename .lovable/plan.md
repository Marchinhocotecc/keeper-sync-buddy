

# Ayro: Motore Decisionale Adattivo - Piano di Implementazione

## Panoramica

Implementazione completa dell'architettura a 7 layer (Layer 0-6) per trasformare Ayro da tracker reattivo a motore decisionale adattivo con identita finanziaria.

**Nessuna migrazione database necessaria** -- tutto salvato in `assistant_state.intent_payload` (JSONB).

---

## Dettagli Tecnici

### Nuovi File (8)

| # | File | Layer | Descrizione |
|---|------|-------|-------------|
| 1 | `src/services/financialState.ts` | 0 | Stato persistente: load/save `financialProfile` da `assistant_state.intent_payload` |
| 2 | `src/services/financialSignals.ts` | 1 | Funzione pura `generateFinancialSignals(userId)`: burnRate, proiezione, impulseCount, weeklyTrend, categoryBreakdown |
| 3 | `src/services/riskEngine.ts` | 2 | `evaluateRisk(signals, profile)` con soglie adattive per behavioralType + `classifyBehavior()` |
| 4 | `src/services/quarterlyProjection.ts` | 5 | `generateProjection(signals, profile)` -- scenari deterministici a 3 mesi |
| 5 | `src/services/actionTracker.ts` | 4 | Tracking azioni (shown/clicked/completed/ignored), calcolo `suggestionAcceptanceRate` |
| 6 | `supabase/functions/ai-free-chat/financialAdvisor.ts` | 3 | Modulo LLM strategico: riceve signals+risk+profile, produce FinancialAdvice validato con Zod |
| 7 | `src/hooks/useFinancialInsights.ts` | 6 | Hook React orchestratore: chiama L0-L5, gestisce regole trigger (max 1/giorno, anti-assuefazione) |
| 8 | `src/components/FinancialInsightCard.tsx` | 6 | Card UI proattiva con indicatore rischio, summary AI, bottoni azione tracciati |

### File Modificati (4)

| File | Modifica |
|------|----------|
| `src/pages/HomePage.tsx` | Importare e mostrare `FinancialInsightCard` sopra i task |
| `src/pages/ExpensesPage.tsx` | Mostrare `FinancialInsightCard` dopo le summary cards |
| `supabase/functions/ai-free-chat/index.ts` | Aggiungere gestione intent `FINANCIAL_ADVICE` che invoca `financialAdvisor.ts` |
| `supabase/functions/ai-free-chat/state.ts` | Aggiungere helpers `loadFinancialProfile()` e `saveFinancialProfile()` |

### Architettura dei Dati

Tutto salvato in `assistant_state.intent_payload`:

```text
intent_payload: {
  // ...campi esistenti (pendingAction, preferences, ecc.)
  
  financialProfile: {
    rollingBurnRate7d: number
    volatilityScore: number
    consistencyScore: number
    behavioralType: "cautious" | "balanced" | "impulsive" | "growth_oriented"
    lastRiskLevel: "safe" | "warning" | "critical"
    riskTrend: "improving" | "stable" | "worsening"
    suggestionAcceptanceRate: number
    lastInsightShownAt: string       // ISO date
    ignoredConsecutive: number        // contatore warning ignorati
    monthlySnapshots: [{month, year, totalSpent, budget, burnRate}]
  },
  
  actionHistory: [{
    id: string
    type: "create_task" | "adjust_budget" | "set_limit"
    title: string
    shownAt: string
    clickedAt?: string
    completedAt?: string
    ignored: boolean
  }]
}
```

### Flusso Runtime

```text
HomePage/ExpensesPage monta
  → useFinancialInsights(userId)
    → loadFinancialProfile()              [Layer 0]
    → generateFinancialSignals(userId)    [Layer 1]
    → evaluateRisk(signals, profile)      [Layer 2]
    → classifyBehavior(signals, profile)  [Layer 2.5]
    → if shouldShowInsight:
        → generateProjection(signals, profile)  [Layer 5]
        → call edge function FINANCIAL_ADVICE   [Layer 3]
          → LLM interpreta con profilo
          → Zod valida output
          → fallback deterministico se invalido
        → trackActionShown()              [Layer 4]
        → render FinancialInsightCard     [Layer 6]
```

### Regole Trigger (Layer 6)

- Max 1 insight al giorno (`lastInsightShownAt`)
- Escalation solo se `riskTrend === "worsening"`
- Dopo 3 warning ignorati consecutivi: pausa 3 giorni
- Prima apertura del mese: sempre mostra riepilogo
- Anti-assuefazione: non ripetere suggerimenti gia ignorati

### Soglie Adattive (Layer 2)

```text
cautious (consistencyScore > 0.8):    warn@70%, critical@85%
balanced (0.5 < score < 0.8):         warn@75%, critical@90%
impulsive (score < 0.5):              warn solo se trend peggiora, critical se proiezione < -10% budget
growth_oriented:                       soglie rilassate, focus trimestrale
```

### Sequenza di Implementazione

1. `financialState.ts` + helpers in `state.ts` (Layer 0)
2. `financialSignals.ts` (Layer 1)
3. `riskEngine.ts` con `classifyBehavior` (Layer 2)
4. `quarterlyProjection.ts` (Layer 5)
5. `actionTracker.ts` (Layer 4)
6. `financialAdvisor.ts` edge function (Layer 3)
7. Aggiornare `ai-free-chat/index.ts`
8. `useFinancialInsights.ts` (Layer 6 - hook)
9. `FinancialInsightCard.tsx` (Layer 6 - UI)
10. Integrare in HomePage + ExpensesPage
11. Deploy edge function

