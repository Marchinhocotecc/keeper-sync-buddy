# Piano: Da Webapp a Native Mobile-First, Performante e Flawless

Obiettivo: l'app deve sembrare e comportarsi come un'app nativa (non una webapp incartata), essere veloce all'avvio e fluida nelle interazioni.

## 1. Performance — bundle, avvio, runtime

**Code splitting per route** (`src/App.tsx`)
- Convertire tutte le pagine in `React.lazy(() => import(...))` con `<Suspense>` + skeleton globale.
- Risultato: bundle iniziale -50/70%, time-to-interactive sotto 1s su mobile.

**Vite build optimization** (`vite.config.ts`)
- `build.target: 'es2020'`, `cssCodeSplit: true`, `chunkSizeWarningLimit: 600`.
- `manualChunks`: separare `react/react-dom`, `@tanstack/react-query`, `framer-motion`, `recharts`, `@radix-ui/*`, `i18next`, `supabase` in chunk dedicati.
- `build.minify: 'esbuild'`, drop `console`/`debugger` in produzione.

**Asset & font**
- Comprimere/convertire `ayvro-logo.png` a WebP (o SVG inline se possibile) e dare width/height espliciti.
- Precaricare solo Inter 400/500/600 (subset latin), `font-display: swap`.

**Query layer** (`src/App.tsx`)
- Allineare `staleTime` per dato: tasks/expenses 60s, settings/profile 5min, summary 10min.
- Aggiungere `placeholderData: keepPreviousData` su liste paginate per evitare flicker.

**Liste**
- `TaskCard` → `React.memo` con comparatore su `id/completed/title/priority`.
- Per liste lunghe (>30) introdurre `@tanstack/react-virtual` su Expenses/Calendar.

## 2. Mobile-first UX (look & feel nativo)

**Layout globale**
- Rimuovere `container max-w-screen-xl` dai page-container su mobile: usare full-bleed con padding 16px.
- Header sticky per pagina con titolo grande in stile iOS Large Title (collassa allo scroll).
- Aumentare touch target minimo a 44×44, spaziature verticali +20% su mobile.

**Bottom Tab Bar** (`Navigation.tsx`)
- Effetto blur (`backdrop-blur-xl bg-card/80`), bordo top sottile, ombra superiore leggera.
- Indicatore attivo: pill colorata dietro l'icona invece del puntino sotto, label sotto opzionale.
- Tap haptic (`hapticImpact('light')`) al cambio tab.

**Transizioni native**
- Page transitions in slide orizzontale (iOS push) invece di fade, con `framer-motion` `x: 100% → 0`.
- Modali sempre come `Sheet` bottom su mobile (già presenti `drawer/sheet`): convertire dialog principali (Add Task, Budget Edit, Add Expense) in bottom sheet con drag handle.

**Feedback tattile e visivo**
- Haptic su: completamento task (già), tap pulsante primario, swipe-to-delete conferma, errore form.
- Stati `active:scale-[0.97]` sui pulsanti (già su tab) → estendere a tutte le card cliccabili.
- Rimuovere hover effects su `(pointer: coarse)` via media query.

**Pull-to-refresh & swipe**
- Verificare presenza su tutte le pagine principali (Home OK, aggiungere su Calendar, Expenses).
- Swipe-to-delete generalizzato anche su `ExpenseCard` e `EventCard`.

**Gesture & navigazione**
- Edge-swipe back su iOS: già gestito nativo, ma assicurarsi che Navigation non blocchi.
- Tasto back Android: già gestito in `useNativeApp`.

## 3. Avvio nativo flawless

**Splash & first paint**
- `capacitor.config.ts`: `launchShowDuration: 0`, `launchAutoHide: false`, hide manuale dopo `App ready` (primo render utile) → niente flash bianco, niente attesa fissa di 1.5s.
- Aggiungere fallback `<div id="boot-splash">` in `index.html` con sfondo `#0F3D3E` + logo, rimosso al mount di App.

**Status bar & safe area**
- `StatusBar.overlaysWebView: false` (già). Verificare colore dinamico chiaro/scuro con tema.
- Top bar pagine: rimuovere il `padding-top: env(safe-area-inset-top)` su `body` perché Capacitor lo gestisce; usare `.safe-area-top` solo dove serve (header sticky) per evitare doppio padding.

**Keyboard**
- `Keyboard.resize: 'body'` (più affidabile per form lunghi) e padding-bottom dinamico su input attivo.

## 4. Affidabilità & "flawless"

- **ErrorBoundary** già presente: aggiungere fallback con pulsante "Ricarica" che invalida cache e ricarica route.
- **Offline**: `OfflineBanner` ok; aggiungere retry automatico con backoff sulle mutation in `useTasks/useExpenses`.
- **Loading states**: sostituire spinner generici con skeleton specifici per ogni pagina (Home già ok, replicare su Expenses/Calendar/Assistant).
- **Sentry-like logging**: già `logger.ts`; assicurare che in produzione non ci siano `console.log`.

## 5. Build size — dipendenze pesanti

Da rivalutare/rimuovere se non usate:
- `recharts` (pesante): caricarlo lazy solo nelle pagine che mostrano grafici.
- `next-themes`: ok ma piccolo.
- Verificare che tutti i `@radix-ui/*` importati siano effettivamente usati.

## 6. Dettagli tecnici (file principali toccati)

```
src/App.tsx                — lazy routes, Suspense, query tuning
src/main.tsx               — rimozione boot splash
index.html                 — boot splash inline + meta viewport-fit=cover
vite.config.ts             — manualChunks, target, minify, drop console
capacitor.config.ts        — splash duration 0, keyboard resize body
src/index.css              — rimuovere padding-top body, hover su coarse
src/components/Navigation.tsx        — blur tab bar, pill indicator, haptic
src/components/PageTransition.tsx    — slide orizzontale
src/components/AddTaskForm.tsx       — Sheet bottom su mobile
src/components/BudgetEditModal.tsx   — Sheet bottom su mobile
src/components/TaskCard.tsx          — React.memo
src/pages/HomePage.tsx               — large-title header, full-bleed mobile
src/pages/CalendarPage.tsx           — pull-to-refresh + swipe
src/pages/ExpensesPage.tsx           — pull-to-refresh + swipe + virtual list
src/hooks/useNativeApp.ts            — hide splash su app ready event
```

## 7. QA

- Verificare bundle iniziale con `vite build` (target < 250KB gz per chunk principale).
- Test manuale su viewport 360×800 e 390×844.
- Lighthouse mobile target: Performance ≥ 90.

## Cosa NON faccio in questo piano

- Non rimuovo feature esistenti.
- Non tocco logica AI/Action Engine.
- Non aggiungo nuove tabelle DB.
- Non pubblico su store (resta passo manuale dell'utente).

Procedo con l'implementazione?
