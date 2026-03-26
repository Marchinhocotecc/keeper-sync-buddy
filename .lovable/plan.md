

## Piano: Ayvro da 7.5 a 9/10 — Completamento

### Cosa manca

3 blocchi di lavoro rimasti, in ordine di priorita.

---

### BLOCCO 1: Delete Confirmations + Empty States (impatto maggiore)

**Delete confirmations** — Aggiungere AlertDialog prima di ogni azione delete:
- `ExpensesPage.tsx`: conferma prima di eliminare spesa
- `CalendarPage.tsx`: conferma prima di eliminare evento
- `TaskCard.tsx`: conferma prima di eliminare task

Pattern: stato `deleteTarget` + AlertDialog che chiama la delete reale solo su conferma.

**Empty states guidati** — Quando non ci sono dati, mostrare card con CTA:
- `HomePage.tsx`: se nessun task → "Crea il tuo primo task" con bottone
- `ExpensesPage.tsx`: se nessuna spesa → "Registra la prima spesa" + se budget = 0 → "Imposta il budget mensile"
- `CalendarPage.tsx`: se nessun evento → "Crea il primo evento"

**File**: `ExpensesPage.tsx`, `CalendarPage.tsx`, `TaskCard.tsx`, `HomePage.tsx`

---

### BLOCCO 2: Password Reset + Onboarding Flow

**Password reset**:
- Creare `src/pages/ResetPasswordPage.tsx` — form con email, chiama `supabase.auth.resetPasswordForEmail()`
- Aggiungere route `/reset-password` in `App.tsx`
- Aggiungere link "Forgot password?" in `AuthPage.tsx`
- Aggiungere chiavi i18n: `auth.forgotPassword`, `auth.resetSent`, `auth.resetEmail`

**Onboarding post-signup**:
- In `App.tsx` o `ProtectedRoute.tsx`, dopo primo login verificare se profilo e' nuovo (nessun budget, nessun task)
- Se nuovo → redirect a `/onboarding` (la pagina esiste gia')

**File**: nuovo `ResetPasswordPage.tsx`, `App.tsx`, `AuthPage.tsx`, `en.json`

---

### BLOCCO 3: Propagazione Traduzioni (21 locale files)

Copiare tutte le nuove chiavi da `en.json` ai 21 file locale con i valori tradotti nella lingua corrispondente. Le chiavi nuove sono in: `common`, `home`, `calendar`, `expenses`, `assistant`, `settings`, `nudge`, `insight`, `auth`.

**File**: tutti i file in `src/i18n/locales/` (da.json, de.json, es.json, et.json, fr.json, hi.json, hr.json, it.json, ja.json, ko.json, lt.json, lv.json, nl.json, no.json, pl.json, pt.json, ro.json, ru.json, sq.json, sv.json, zh.json)

---

### Ordine di implementazione

1. **Blocco 1** — Delete confirmations + empty states (impatto UX immediato)
2. **Blocco 2** — Password reset + onboarding (completezza auth)
3. **Blocco 3** — Traduzioni (coerenza globale)

### Nessuna modifica al database

Tutto frontend. Le tabelle Supabase restano invariate.

