
# Piano Completo: Ayro Native APK con Capacitor

## Obiettivo

Trasformare Ayro (attualmente PWA/web) in un'app nativa Android (APK) installabile su qualsiasi dispositivo Android, usando Capacitor come bridge tra React e il sistema operativo nativo.

## Architettura Risultante

```text
PRIMA (attuale)
  Browser Web
      |
   React App (Vite)
      |
   Supabase

DOPO (APK)
  Android WebView (Capacitor)
      |
   React App (Vite build)
      |
   Capacitor Bridge (accesso API native)
      |
   Supabase (invariato)
```

## Problemi Critici Identificati

### 1. Auth Storage - localStorage
**File:** `src/integrations/supabase/client.ts`

```typescript
// PROBLEMA ATTUALE
auth: {
  storage: localStorage,  // crash/perdita sessione in background Android
}

// SOLUZIONE
// Usare @capacitor/preferences per storage nativo persistente
```

Il `localStorage` WebView Android può essere svuotato dal sistema quando l'app va in background. L'utente si ritrova sloggato ogni volta.

### 2. Deep Link email di conferma
**File:** `src/pages/AuthPage.tsx`

```typescript
// PROBLEMA ATTUALE
emailRedirectTo: `${window.location.origin}/`
// In APK: window.location.origin = "" o URL non valido

// SOLUZIONE
emailRedirectTo: `io.ayro.app://auth-callback`
// URL scheme nativo che Capacitor intercetta
```

Senza deep link configurato, il link di conferma email apre il browser esterno e non rientra nell'app.

### 3. Notifiche - Web Notifications API
**File:** `src/services/notificationService.ts`

```typescript
// PROBLEMA ATTUALE
if (!('Notification' in window)) return false; // sempre false in WebView
new Notification(title, { body })              // non funziona in APK

// SOLUZIONE
// Rilevamento piattaforma + fallback graceful
// Notifiche attive solo se browser (PWA)
// APK: disabilitare silenziosamente senza crash
```

In Android WebView, l'API `Notification` non esiste. Il servizio attuale non crasha ma diventa completamente non funzionale senza feedback.

### 4. window.focus()
**File:** `src/services/notificationService.ts` (riga 129)

```typescript
// PROBLEMA ATTUALE
notification.onclick = () => {
  window.focus(); // no-op in WebView, warning a runtime
  notification.close();
};

// SOLUZIONE: rimuovere window.focus()
```

## File da Modificare

| File | Modifica |
|------|----------|
| `package.json` | Aggiungere `@capacitor/core`, `@capacitor/android` come dipendenze |
| `capacitor.config.ts` | Nuovo file di configurazione Capacitor |
| `src/integrations/supabase/client.ts` | Sostituire `localStorage` con storage compatibile |
| `src/pages/AuthPage.tsx` | Fix `emailRedirectTo` per deep link nativo |
| `src/services/notificationService.ts` | Guard per WebView + rimuovere `window.focus()` |
| `vite.config.ts` | Nessuna modifica (già compatibile) |

## Passi di Implementazione

### Step 1 - Dipendenze Capacitor
Aggiungere al `package.json`:
- `@capacitor/core` (runtime Capacitor nel browser/WebView)
- `@capacitor/android` (solo per build nativa, dev dependency)
- `@capacitor/cli` (strumenti CLI, dev dependency)
- `@capacitor/preferences` (storage nativo sicuro, sostituisce localStorage)

### Step 2 - capacitor.config.ts
Creare il file di configurazione con:
- `appId: "io.ayro.app"` (bundle ID univoco Android)
- `appName: "Ayro"`
- `webDir: "dist"` (output di `vite build`)
- `server.url` con live reload (per sviluppo)
- `android.allowMixedContent: true`

### Step 3 - Fix Auth Storage
In `src/integrations/supabase/client.ts`:

Creare un adapter custom che usa `@capacitor/preferences` in ambiente nativo e `localStorage` in browser. Il client Supabase accetta qualsiasi oggetto con interfaccia `{ getItem, setItem, removeItem }`.

```typescript
// Adapter compatibile con entrambi gli ambienti
const storage = isNative() ? capacitorStorage : localStorage;
export const supabase = createClient(URL, KEY, { auth: { storage } });
```

### Step 4 - Fix Deep Link Auth
In `src/pages/AuthPage.tsx`:

```typescript
const getRedirectUrl = () => {
  // In APK usa custom URL scheme
  if (isNativePlatform()) return 'io.ayro.app://auth-callback';
  // In browser usa origin normale
  return `${window.location.origin}/`;
};
```

Configurare anche `AndroidManifest.xml` con intent-filter per intercettare `io.ayro.app://` (fatto tramite `capacitor.config.ts`).

### Step 5 - Fix Notification Service
In `src/services/notificationService.ts`:

- Aggiungere check `isNativePlatform()` all'inizio di `initNotificationService`
- In ambiente nativo: restituire `false` senza errori (nessun crash)
- Rimuovere `window.focus()` dalla callback `onclick`
- Lasciare tutto il resto invariato (scheduling Supabase funziona uguale)

## Cosa NON cambia

- Tutta la logica business (task, eventi, spese, assistente)
- Supabase URL, chiavi, schema database
- Edge functions
- UI e stile (Tailwind, shadcn/ui)
- React Router (funziona con `BrowserRouter` in Capacitor)

## Istruzioni Post-Deploy (manuali - non automatizzabili)

Dopo che il codice sarà aggiornato, per generare l'APK dovrai:

1. **Esportare su GitHub** tramite il tasto "Export to Github" in Lovable
2. **Git clone** sul tuo computer
3. Eseguire:
   ```bash
   npm install
   npx cap add android
   npx cap sync
   npm run build
   npx cap sync
   npx cap run android
   ```
4. Serve **Android Studio** installato sul tuo PC
5. L'APK debug sarà generabile direttamente da Android Studio (Build > Build APK)

**Costo:** Nessuno (strumenti open source). Google Play Store richiede $25 una tantum solo se vuoi pubblicarlo.

## Nota sul sistema di notifiche

Le notifiche native Android richiederebbero `@capacitor/push-notifications` + un server FCM (Firebase Cloud Messaging). Questo va oltre lo scope attuale.

Il piano corrente: le notifiche vengono disabilitate silenziosamente sull'APK (nessun crash). L'architettura Supabase `scheduled_notifications` rimane intatta e potrà essere connessa a notifiche native in un secondo momento.

## Risultato Finale

L'APK di Ayro sarà:
- Installabile su Android senza Play Store (sideload)
- Sessione auth persistente anche dopo background
- Deep link email funzionante
- Nessun crash da API web non supportate
- Pronto per pubblicazione Play Store
