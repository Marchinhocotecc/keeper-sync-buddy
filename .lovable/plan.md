

## Stato attuale: ~88/100

Molte cose sono state fatte bene: ErrorBoundary, OfflineBanner, QueryClient ottimizzato, PullToRefresh, PageTransitions, formatCurrency dinamico, greeting personalizzato, swipe-to-delete. Ma ci sono ancora lacune concrete che impediscono il "product ready".

---

### Cosa manca (7 interventi)

#### 1. Pagine non usano `useAuth()` — AuthContext inutilizzato
Il context esiste ma **nessuna pagina lo usa**. Queste pagine chiamano ancora `supabase.auth.getUser()` direttamente:
- `ExpensesPage.tsx` (riga 69)
- `CalendarPage.tsx` (riga 57)
- `SettingsPage.tsx` (riga 92)
- `WellnessCard.tsx` (riga 29)

**Azione**: Sostituire tutte le chiamate con `const { user } = useAuth()` e rimuovere gli `useEffect` relativi.

#### 2. ErrorBoundary — testo hardcoded in inglese
"Something went wrong", "Reload" non sono tradotti.

**Azione**: Usare chiavi i18n (con fallback inglese, dato che ErrorBoundary potrebbe non avere accesso al provider i18n).

#### 3. OfflineBanner — testo hardcoded in inglese
"You're offline — changes won't be saved" non e' tradotto.

**Azione**: Usare `useTranslation()` con chiave `common.offline`.

#### 4. Nessun spinner sui bottoni di azione
- "Add task" in HomePage non mostra loading durante `mutateAsync`
- "Quick add" expense non mostra loading
- Budget save ha lo spinner, ma gli altri no

**Azione**: Aggiungere `disabled={addTask.isPending}` e spinner icon sui bottoni di add task e quick-add expense.

#### 5. Undo toast spese usa chiave sbagliata
Riga 130 di ExpensesPage: `t('home.taskAdded')` — mostra "Task aggiunto" invece di "Spesa aggiunta".

**Azione**: Usare `t('expenses.expenseAdded')` con chiave dedicata.

#### 6. console.log residui nelle Supabase Edge Functions
`intentClassifier.ts` e altri file in `supabase/functions/` hanno ancora `console.log` attivi. In produzione questi riempiono i log inutilmente.

**Azione**: Rimuovere o ridurre a `console.warn`/`console.error` solo per errori reali nelle edge functions.

#### 7. Streak visuale mancante
Il piano prevedeva una streak ("3 giorni consecutivi") ma e' stata implementata solo la progress bar. La streak e' un driver di retention.

**Azione**: Aggiungere un indicatore streak nell'hero summary (icona fiamma + numero giorni consecutivi con almeno 1 task completato). Calcolo client-side basato sulle date di completamento task.

---

### Ordine di implementazione

1. Migrare pagine a `useAuth()` (impatto architetturale)
2. Spinner su bottoni di azione (UX immediata)
3. Fix undo toast chiave sbagliata
4. i18n ErrorBoundary + OfflineBanner
5. Streak visuale
6. Pulizia console.log edge functions
7. Propagazione chiavi i18n nuove ai 22 locale

### Nessuna modifica al database

