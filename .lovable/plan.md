

## Ayvro: Da App a Prodotto Vendibile

### Punteggio attuale: ~90/100 come app. ~65/100 come prodotto vendibile.

L'app funziona bene tecnicamente. Ma per **vendere** servono cose che non sono codice: monetizzazione, landing page, legal compliance, e strategia di acquisizione.

---

## Cosa Manca per Vendere (5 interventi)

### 1. Landing Page pubblica (pre-login)
**Problema**: Chi arriva su Ayvro vede direttamente la schermata di login. Nessuna spiegazione di cosa fa l'app, nessun motivo per registrarsi.

**Azione**: Creare una landing page `/landing` con:
- Hero: tagline + screenshot/mockup dell'app
- 3 feature cards (Task, Expenses, AI Assistant)
- CTA "Inizia gratis" che porta a `/auth`
- Footer con link a Privacy, Terms, contatto

Rotta `/` per utenti non autenticati mostra la landing; per autenticati mostra la home.

**File**: nuovo `src/pages/LandingPage.tsx`, modifica `App.tsx` routing

---

### 2. Paywall / Piano Premium
**Problema**: L'app ha gia il concetto FREE/PREMIUM nel codice (`planRouter.ts`, rate limit 10/200 messaggi) ma nessuna UI per upgradare. L'utente non sa che esiste un piano a pagamento.

**Azione**: 
- Abilitare i pagamenti tramite Lovable Payments (Paddle o Stripe)
- Creare una pagina `/pricing` con piano Free vs Premium
- Aggiungere un banner "Upgrade" quando l'utente raggiunge il limite messaggi AI
- Collegare lo stato premium al profilo utente

**File**: nuovo `src/pages/PricingPage.tsx`, modifica `planRouter.ts`, `AssistantPanel.tsx`

---

### 3. Delete Account (obbligatorio GDPR + App Store)
**Problema**: Non esiste la possibilita di eliminare il proprio account. Apple e Google lo richiedono. Il GDPR lo impone.

**Azione**: Aggiungere un bottone "Elimina account" in Settings con conferma a doppio step (scrivi "ELIMINA" per confermare). Chiama una edge function che cancella dati utente + auth account.

**File**: modifica `SettingsPage.tsx`, nuova edge function `delete-account`

---

### 4. Onboarding migliorato per conversione
**Problema**: L'onboarding attuale mostra 3 slide generiche. Non mostra il valore unico di Ayvro ne guida l'utente a completare la prima azione.

**Azione**: Dopo l'onboarding, guidare l'utente a completare 1 azione concreta (aggiungere il primo task o la prima spesa). "First value" entro 60 secondi dalla registrazione.

**File**: modifica `OnboardingPage.tsx`, `HomePage.tsx`

---

### 5. Analytics e tracking conversioni
**Problema**: Plausible e configurato ma non traccia eventi chiave: signup, first_task, first_expense, upgrade. Senza dati non puoi ottimizzare.

**Azione**: Aggiungere eventi custom Plausible nei punti critici del funnel.

**File**: modifica `AuthPage.tsx`, `HomePage.tsx`, `ExpensesPage.tsx`

---

## Come Sponsorizzare Ayvro

### Canali consigliati (budget-efficiente)

1. **Product Hunt launch** — Gratuito. Ayvro ha il profilo perfetto: app finanziaria con AI, design pulito, nicchia chiara. Preparare screenshot, video demo 60s, tagline forte.

2. **Content marketing (SEO)** — Blog su `ayvro.app/blog` con articoli tipo:
   - "Come tracciare le spese senza impazzire"
   - "5 segnali che stai spendendo troppo"
   - Target: persone che cercano soluzioni finanziarie personali

3. **Social media organico** — TikTok/Instagram Reels con demo veloci dell'app (15-30s). Il formato "guarda come gestisco i soldi con questa app" funziona bene nella nicchia fintech.

4. **Micro-influencer finanza personale** — Collaborazioni con creator da 5-50K follower nella nicchia "personal finance". Costo basso, pubblico targettizzato.

5. **App Store Optimization (ASO)** — Se pubblichi su Play Store/App Store: keywords "expense tracker", "budget app", "financial planner AI". Screenshot ottimizzate, video preview.

6. **Reddit / community** — r/personalfinance, r/budgeting, r/fintech. Post genuini, non spam. Mostrare il prodotto risolvendo problemi reali.

### Pricing suggerito
- **Free**: Task illimitati, 10 messaggi AI/giorno, tracking spese base
- **Premium** (4.99-7.99/mese): AI illimitata, insights avanzati, export dati, streak avanzate, wellness completo

---

## Ordine di implementazione

1. Landing page (acquisizione)
2. Delete account (compliance obbligatoria)
3. Paywall + pagamenti (monetizzazione)
4. Onboarding conversione (retention)
5. Analytics eventi (ottimizzazione)

