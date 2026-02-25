

# Audit Coerenza: Risultati Checklist 7 Punti

## Risultati

| # | Check | Stato | Dettaglio |
|---|-------|-------|-----------|
| 1 | No spese → no crash | **PASS** | `financialSignals.ts:61` — `if (budget === 0 && expenses.length === 0) return null`. Hook gestisce null correttamente (line 47-51: setta insight a null). Se ci sono spese ma no budget, burnRate=0, nessun crash. |
| 2 | No budget → insight neutro | **PASS** | Budget=0 → burnRate=0, soglie mai raggiunte → riskLevel resta "safe". Risk engine line 70-71 salta il check `projectedEndBalance < 0` quando `budget === 0`. Nessun errore, nessun insight mostrato. |
| 3 | burnRate 0.0 → safe | **PASS** | burnRate=0 non supera nessuna soglia adattiva (min 0.70 per cautious). riskLevel resta "safe". |
| 4 | projectedEndBalance negativo → critical | **PASS** | `riskEngine.ts:67-69` — `if (projectedEndBalance < 0 && budget > 0) → riskLevel = "critical"`. Flag "negative_projection" aggiunto. |
| 5 | impulseCount >= 3 → warning soft | **PASS** | `financialSignals.ts:110` — `impulseFlag = impulseCount >= 3`. `riskEngine.ts:80-82` — per profili non-impulsive: `if (impulseFlag && riskLevel === "safe") → warning + flag "impulse_spending"`. Per profili "impulsive" usa soglia diversa (proiezione < -10% budget) per evitare assuefazione. |
| 6 | LLM max 3 azioni | **PASS** | `financialAdvisor.ts:71` — `raw.actions.slice(0, 3)`. Insights: `slice(0, 3)` (line 68). Prompt system dice "massimo 3 azioni CONCRETE". Doppia protezione (prompt + validazione). |
| 7 | Zod blocca output invalido | **PASS** | `validateAdvice()` (lines 61-90) controlla: summary string, riskLevel valido, insights array, actions array con type/title/reason/priority. Se fallisce → `buildDeterministicFallback()` (line 218-220). |

---

## Problemi Trovati (Fuori Checklist ma Critici)

### BUG 1: Feedback Loop Non Collegato (Layer 4 rotto)

**File:** `src/components/FinancialInsightCard.tsx`

Il componente importa `trackActionClicked` (line 13) ma **non lo usa mai**. `handleActionClick` (line 64-67) chiama solo `onActionClick?.()` senza tracciare il click.

Inoltre, il hook `useFinancialInsights.ts` chiama `trackActionShown()` (line 165-167) che restituisce un `actionId`, ma questo ID **non viene passato** al componente `FinancialInsightCard`. Senza l'ID, il card non puo' tracciare i click.

**Conseguenza:** `suggestionAcceptanceRate` non si aggiorna mai. Il profilo comportamentale non evolve basandosi sulle azioni dell'utente.

**Fix necessario:**
1. `useFinancialInsights` deve raccogliere gli `actionId` restituiti da `trackActionShown` e includerli negli oggetti `action` passati al componente
2. `FinancialInsightCard` deve chiamare `trackActionClicked(userId, actionId)` quando l'utente clicca un bottone azione

### BUG 2: `consistencyScore` Mai Aggiornato

Il `consistencyScore` nel profilo ha un valore default di 0.5 (`financialState.ts:33`) e **non viene mai ricalcolato**. Nessuna funzione aggiorna questo campo basandosi sui dati reali.

**Conseguenza:** La classificazione comportamentale (`classifyBehavior`) usa `consistencyScore > 0.8` e `< 0.3` come soglie, ma il valore resta sempre 0.5 → l'utente sara' sempre classificato "balanced" a meno che non abbia impulseCount >= 4.

**Fix necessario:** Calcolare `consistencyScore` in `useFinancialInsights` basandosi su quanto l'utente rispetta il budget (es. media degli ultimi 3 mesi di `burnRate <= 1.0`).

### BUG 3: `volatilityScore` Mai Calcolato

Stesso problema di `consistencyScore` — dichiarato nel profilo ma mai aggiornato. Non e' usato attivamente nelle soglie attuali, quindi impatto minore, ma e' dead code.

---

## Piano di Correzione

### Modifiche (3 file)

1. **`src/hooks/useFinancialInsights.ts`**
   - Raccogliere gli `actionId` da `trackActionShown()` e includerli nel risultato insight
   - Calcolare `consistencyScore` dai `monthlySnapshots` (media di `min(1, 1 - abs(burnRate - 1))` per ogni mese)
   - Calcolare `volatilityScore` dalla deviazione standard delle spese giornaliere

2. **`src/components/FinancialInsightCard.tsx`**
   - Aggiungere `actionId` all'interfaccia delle azioni
   - Chiamare `trackActionClicked(userId, actionId)` nel `handleActionClick`

3. **`src/hooks/useFinancialInsights.ts` (tipo FinancialInsight)**
   - Estendere il tipo `FinancialAction` locale con campo `actionId: string`

Nessuna modifica all'edge function o al database.

