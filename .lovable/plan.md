

## Piano: Ayvro da 8 a 9/10 — Ultime Lacune

### Cosa manca (6 interventi)

---

### 1. AuthPage — i18n completo
Sostituire tutte le stringhe hardcoded con `t()`:
- "Sign In" → `t('auth.signIn')`
- "Sign Up" → `t('auth.signUp')`
- "Create Account" → `t('auth.signUp')`
- "Forgot password?" → `t('auth.forgotPassword')`
- "I accept the" / "Terms and Conditions" → `t('auth.acceptTerms')` + `t('auth.termsLink')`
- "Email", "Password", placeholder text

Aggiungere chiavi mancanti a `en.json`: `auth.acceptTerms`, `auth.termsLink`, `auth.passwordPlaceholder`.

**File**: `AuthPage.tsx`, `en.json`

---

### 2. NotificationSettings — i18n
Sostituire "Benessere", "Check-in serale", "Orario:" e qualsiasi altra stringa hardcoded con `t()`.

**File**: `NotificationSettings.tsx`, `en.json`

---

### 3. TermsAndConditionsPage + AcceptTermsPage — i18n
Queste pagine sono interamente in italiano. Sostituire tutto il testo con chiavi i18n.

**File**: `TermsAndConditionsPage.tsx`, `AcceptTermsPage.tsx`, `en.json`

---

### 4. Onboarding redirect per nuovi utenti
In `ProtectedRoute.tsx`, dopo autenticazione verificare se il profilo e' vuoto (nessun budget/task). Se si, redirect a `/onboarding`.

Logica: query leggera a Supabase per contare task + verificare budget. Se entrambi zero → redirect. Salvare flag `onboarding_completed` in localStorage per evitare check ripetuti.

**File**: `ProtectedRoute.tsx`

---

### 5. CalendarPage locale dinamico
Attualmente importa solo `it` da date-fns. Creare un helper che mappa `i18n.language` al locale date-fns corretto per formattare date nella lingua giusta.

**File**: `CalendarPage.tsx` (o nuovo `src/utils/dateLocale.ts`)

---

### 6. Propagazione traduzioni reali ai 21 locale
I file locale hanno le chiavi ma molti valori sono in inglese (copia diretta). Generare traduzioni corrette per le nuove chiavi aggiunte nei punti 1-3 sopra.

**File**: tutti i `src/i18n/locales/*.json`

---

### Ordine di implementazione

1. AuthPage i18n (visibile subito, utente e' su /auth)
2. NotificationSettings i18n
3. Terms pages i18n
4. CalendarPage locale dinamico
5. Onboarding redirect
6. Propagazione traduzioni

### Nessuna modifica al database

