

## Valutazione: Ayvro — Product Readiness Score

### Punteggio attuale: **82/100**

L'app ha una base solida ma ci sono diverse aree che impediscono di raggiungere il livello "product ready" premium.

---

### Cosa funziona bene (punti forti)

- **i18n completo**: 22 lingue, chiavi tradotte, onboarding localizzato
- **Design system coerente**: palette Ayvro (teal), dark mode, variabili CSS ben organizzate
- **Mobile-first UX**: bottom nav icon-only, pull-to-refresh, swipe-to-delete, page transitions
- **Funzionalita core complete**: task, spese, calendario, assistente AI, wellness, budget
- **Valuta dinamica**: `formatCurrency` basato su locale
- **Delete confirmations + empty states**: presenti ovunque
- **Auth flow**: sign in/up, forgot password, terms acceptance, onboarding

---

### Cosa manca per essere product-ready (problemi)

#### A. Qualita del codice (-5 punti)
1. **~190 console.log in produzione**: `dataService.ts`, `useTasks.ts`, `planRouter.ts`, `aiFreeOrchestrator.ts` — stampano dati utente in console. Inaccettabile per un prodotto a pagamento.
2. **Nessun error boundary**: se un componente crasha, l'intera app diventa bianca. Servono error boundaries React per catturare errori e mostrare un fallback.

#### B. Coerenza UX (-4 punti)
3. **AssistantPanel `detectIntentType`** (riga 48-54): regex solo in italiano (`posso permettermi`, `come sto`, `pianifica`). Non funziona per 21 delle 22 lingue supportate. Un utente tedesco o francese non attivera mai queste funzioni.
4. **`formatTime` hardcoded** in AssistantPanel (riga 40-46): usa `'en-US'` con `hour12: false`. Dovrebbe usare il locale dell'utente.
5. **Date locale mapping manuale** in ExpensesPage e HomePage: catena `if/else` per 5 lingue, le altre 17 fallback su `en-US`. Usare `i18n.language` direttamente con `Intl.DateTimeFormat`.

#### C. Performance e affidabilita (-4 punti)
6. **Nessun React.memo/useMemo sui componenti lista**: `TaskCard`, expense rows, insight cards vengono ri-renderizzati ad ogni cambio di stato. Su liste lunghe crea lag percepibile.
7. **`supabase.auth.getUser()` chiamato in ogni pagina separatamente**: `ExpensesPage`, `CalendarPage`, `WellnessCard`, `SettingsPage` — ognuno fa la sua chiamata. Serve un AuthContext centralizzato.
8. **QueryClient senza configurazione**: nessun `staleTime`, `gcTime`, o `retry` configurato. Le query ripartono ad ogni focus di finestra.

#### D. Polish mancante (-5 punti)
9. **Nessun loading state per le azioni**: quando si aggiunge un task/spesa, il bottone non mostra uno spinner. L'utente non sa se il click e' stato registrato.
10. **Nessun feedback tattile**: swipe-to-delete esiste ma manca `navigator.vibrate()` o Capacitor Haptics per dare sensazione nativa.
11. **PullToRefresh non refresha tutto**: HomePage refresha solo tasks/expenses/home-data. Non refresha wellness, insights, calendar events.
12. **Nessuna gestione offline**: se l'utente perde connessione, nessun banner o fallback. Le azioni falliscono silenziosamente.

---

### Piano per arrivare a 95/100

#### Priorita 1: Pulizia produzione (impatto immediato)
- **Rimuovere tutti i console.log** da `src/services/`, `src/hooks/`, `src/assistant/` — sostituire con un logger condizionale (`if (import.meta.env.DEV)`)
- **Aggiungere ErrorBoundary** globale con fallback UI ("Qualcosa e' andato storto, ricarica")

#### Priorita 2: AuthContext centralizzato
- Creare `src/contexts/AuthContext.tsx` con `useAuth()` hook
- Eliminare i 5+ `supabase.auth.getUser()` sparsi nelle pagine
- Riduce chiamate di rete e rende l'app piu reattiva

#### Priorita 3: Coerenza internazionale
- Rimuovere `detectIntentType` regex italiano dall'AssistantPanel (lasciare la classificazione al backend AI)
- Sostituire i mapping `dateLocale` manuali con `i18n.language` diretto
- Usare `Intl.DateTimeFormat(i18n.language)` ovunque

#### Priorita 4: QueryClient ottimizzato
- Configurare `staleTime: 5 * 60 * 1000` per ridurre refetch inutili
- Aggiungere `retry: 2` con backoff
- Aggiungere `refetchOnWindowFocus: false` per evitare flash di loading

#### Priorita 5: Feedback utente premium
- Spinner sui bottoni durante le mutazioni (task add, expense add, budget save)
- Banner offline con `navigator.onLine` + listener
- PullToRefresh che invalida TUTTE le query

#### Priorita 6: Performance
- `React.memo` su `TaskCard`, expense rows
- `useMemo` per `categoryData`, `filteredExpenses` (gia presente in parte, verificare coerenza)

---

### Riepilogo impatto

| Area | Ora | Dopo | Punti |
|------|-----|------|-------|
| Console.log in prod | 190 log | 0 | +2 |
| Error boundary | Assente | Presente | +2 |
| Auth centralizzato | 5 chiamate duplicate | 1 context | +2 |
| i18n coerente | 5/22 lingue per date | 22/22 | +2 |
| QueryClient config | Default | Ottimizzato | +1 |
| Loading states azioni | Assenti | Spinner | +2 |
| Offline handling | Assente | Banner | +1 |
| Performance memo | Assente | Presente | +1 |
| **Totale** | **82** | **95** | **+13** |

### Nessuna modifica al database
Tutto frontend.

