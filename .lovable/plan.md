

## Piano: Portare Ayvro a 9/10

### Stato Attuale: ~6/10

Dopo analisi completa del codice, i problemi principali sono raggruppabili in 5 macro-aree.

---

### AREA 1: Internazionalizzazione rotta (4/10 → 9/10)

**Problema**: L'app ha 22 file di traduzione ma ~80% delle stringhe UI sono hardcoded in italiano. HomePage, WellnessCard, DailyNudge, BudgetCard, ExpensesPage, CalendarPage, SettingsPage contengono tutte stringhe italiane dirette.

**Esempi trovati**:
- HomePage: "Ciao", "Task completati", "Priorità alta", "Spese settimana", "I miei Task", "Aggiungi", "Nessun task prioritario per oggi", "Fatto!", "Ops!"
- WellnessCard: "Benessere", "Passi", "Ore di sonno", "Meditazione", "Salvataggio..."
- DailyNudge: "Evita nuove spese oggi", "Oggi dovresti restare sotto..."
- ExpensesPage: "Totale Spese", "Rimanente", "Spese Recenti", "Per Categoria", "Cibo", "Trasporti"
- SettingsPage: "Modifica", "Assistente", "Memoria assistente", "Scrivici"
- CalendarPage: date format hardcoded `it-IT`, "Errore", "Il titolo è obbligatorio"
- AssistantPage: "Start Chat", "Manage tasks & events" (hardcoded in English)

**Azione**: Sostituire TUTTE le stringhe hardcoded con chiamate `t()`. Aggiungere le chiavi mancanti a `en.json` e propagare a tutti i locale file.

**File coinvolti**: `HomePage.tsx`, `WellnessCard.tsx`, `DailyNudge.tsx`, `ExpensesPage.tsx`, `CalendarPage.tsx`, `SettingsPage.tsx`, `AssistantPage.tsx`, `AssistantPanel.tsx`, `AddTaskForm.tsx`, `BudgetCard.tsx`, `BudgetEditModal.tsx`, `FinancialInsightCard.tsx`, `en.json` + tutti i locale.

---

### AREA 2: Wellness disconnesso dal core (3/10 → 8/10)

**Problema**: WellnessCard è un widget isolato che non si integra con il motore finanziario ne con l'assistente. Non aggiunge valore alla value proposition "Decision Engine for Your Money".

**Azione**:
1. Rinominare la sezione da "Benessere" a "Daily Check-in" — mantenerla ma collegarla al contesto
2. Aggiungere nel DailyNudge un riferimento al sonno/passi se disponibili (es: "Hai dormito poco ieri, attenzione alle decisioni impulsive")
3. Rendere il wellness opzionale/collassabile nella HomePage per non distrarre dal focus finanziario

**File coinvolti**: `WellnessCard.tsx`, `DailyNudge.tsx`, `HomePage.tsx`

---

### AREA 3: UX e Layout inconsistente (6/10 → 9/10)

**Problema**:
- Navigation su mobile mostra solo icone senza bottom tab bar (standard mobile)
- HomePage mischia task + wellness senza gerarchia chiara
- CalendarPage ha FAB che si sovrappone alla navbar mobile
- SettingsPage ha `motion.div` annidati duplicati (riga 348-349: due `motion.div variants={itemVariants}` consecutivi)
- No password reset flow
- No onboarding per nuovi utenti (OnboardingPage esiste ma non è usata nel flusso)

**Azione**:
1. Aggiungere bottom tab bar per mobile (standard pattern) — la navbar attuale diventa desktop-only
2. Fixare il FAB position su CalendarPage per evitare overlap con bottom nav
3. Fixare il doppio `motion.div` in SettingsPage (bug visivo)
4. Aggiungere password reset flow (`/reset-password` page + link "Forgot password?" in AuthPage)
5. Collegare OnboardingPage nel flusso post-signup (prima del redirect a Home)

**File coinvolti**: `Navigation.tsx` (nuovo bottom nav), `CalendarPage.tsx`, `SettingsPage.tsx`, `AuthPage.tsx`, `App.tsx`

---

### AREA 4: Robustezza dati e feedback (5/10 → 9/10)

**Problema**:
- Expense delete non ha conferma
- Calendar event delete non ha conferma
- Task delete non ha conferma
- Nessuna empty state guidata (primo accesso: pagine vuote senza CTA chiare)
- Budget default = 0 senza prompt per impostarlo
- Nessun feedback di successo dopo creazione evento calendario

**Azione**:
1. Aggiungere dialog di conferma per tutte le azioni delete (expense, event, task)
2. Aggiungere empty states guidati: primo accesso mostra card con CTA "Imposta il tuo budget", "Aggiungi la prima spesa", "Crea il primo task"
3. Aggiungere toast di successo dopo creazione evento
4. Prompt budget al primo accesso se budget = 0

**File coinvolti**: `ExpensesPage.tsx`, `CalendarPage.tsx`, `HomePage.tsx`, `TaskCard.tsx`

---

### AREA 5: Assistente AI (attuale 5/10 → 8/10)

**Problema**: Già affrontato nei piani precedenti. Rimangono:
- AssistantPage richiede click "Start Chat" — aggiunge friction inutile
- No indicatore di caricamento chiaro durante la risposta AI
- Nessun onboarding nell'assistente (cosa può fare?)
- Quick actions poco visibili

**Azione**:
1. Rimuovere la splash page "Start Chat" — mostrare direttamente la chat con welcome message
2. Migliorare l'indicatore di typing/loading (dots animati)
3. Aggiungere 3-4 suggestion chips visibili all'apertura ("Come sto andando?", "Che task ho?", "Posso permettermi...?")

**File coinvolti**: `AssistantPage.tsx`, `AssistantPanel.tsx`

---

### Riepilogo file modificati

| Area | File | Tipo modifica |
|------|------|---------------|
| i18n | 15+ componenti + 22 locale files | Sostituzione stringhe |
| Wellness | 3 componenti | Refactor integrazione |
| UX | 6 componenti | Layout + nuova bottom nav |
| Robustezza | 4 componenti | Conferme + empty states |
| Assistente | 2 componenti | Rimozione friction |

### Ordine di implementazione consigliato

1. **Fix bug** (SettingsPage doppio motion.div) — 2 min
2. **Bottom nav mobile** — impatto UX maggiore
3. **i18n completo** — coerenza globale
4. **Delete confirmations + empty states** — robustezza
5. **Assistant splash removal** — riduzione friction
6. **Wellness integration** — valore aggiunto
7. **Password reset + onboarding flow** — completezza auth

### Nessuna modifica al database

Tutte le modifiche sono frontend. Il contratto API e le tabelle Supabase restano invariati.

