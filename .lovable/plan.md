

## Stato Attuale: ~8.5/10

Il grosso del lavoro e' fatto. Restano **5 interventi puntuali** per il 9.5/10.

---

### 1. OnboardingPage — i18n completo
**Problema**: Tutte le stringhe sono hardcoded in italiano: "Gestisci i tuoi Task", "Traccia le tue Spese", "Parla con Ayvro", "Avanti", "Inizia", "Salta tutorial", "Prova a dire:".

**Azione**: Sostituire con `t()`, aggiungere chiavi `onboarding.*` a `en.json` e propagare ai locale.

**File**: `OnboardingPage.tsx`, `en.json`

---

### 2. Navigation — stringa hardcoded
**Problema**: Riga 22: `toast({ title: 'Error', description: 'Something went wrong. Try again.' })` — hardcoded in inglese.

**Azione**: Sostituire con `t('common.error')` e `t('common.tryAgain')`.

**File**: `Navigation.tsx`

---

### 3. AssistantPanel — UI_ACTION_MAP hardcoded
**Problema**: Righe 157-170: "Mostra task", "Mostra eventi", "Aggiungi task" ecc. sono hardcoded in italiano E inglese. Non funzionano per le altre 20 lingue.

**Azione**: Rimuovere le stringhe hardcoded e usare solo le chiavi `t()` gia' presenti (righe 154-156). Il map basato su traduzione dinamica copre gia' tutte le lingue.

**File**: `AssistantPanel.tsx`

---

### 4. ProtectedRoute — onboarding flag fix
**Problema**: L'onboarding redirect funziona ma salva il flag con `localStorage.setItem('onboarding_completed_' + userId)` solo se trova dati. L'`OnboardingPage` invece usa `supabase.auth.updateUser({ data: { onboarding_completed: true } })`. Mismatch: il ProtectedRoute non controlla il metadata utente, e l'OnboardingPage non setta il localStorage.

**Azione**: Allineare: in ProtectedRoute controllare anche `user.user_metadata.onboarding_completed`. In OnboardingPage settare anche il localStorage flag per evitare query ripetute.

**File**: `ProtectedRoute.tsx`, `OnboardingPage.tsx`

---

### 5. Propagazione traduzioni nuove chiavi onboarding
Aggiungere le chiavi `onboarding.*` a tutti i 21 file locale con traduzioni corrette per le lingue principali (it, de, fr, es, pt) e inglese come fallback per le altre.

**File**: tutti i `src/i18n/locales/*.json`

---

### Ordine di implementazione

1. OnboardingPage i18n
2. Navigation fix stringa
3. AssistantPanel cleanup hardcoded
4. ProtectedRoute + OnboardingPage flag alignment
5. Propagazione traduzioni

### Nessuna modifica al database

