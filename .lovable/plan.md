
# Da WebApp ad App Nativa: Ayvro

## Stato di partenza
Capacitor 8 gia configurato (`com.ayvro.app`), `@capacitor/preferences` per auth storage, deep link `com.ayvro.app://auth-callback`. Manca tutto il resto del livello nativo.

---

## 1. Plugin Capacitor nativi

Installare e integrare:
- `@capacitor/splash-screen` — splash brandizzato
- `@capacitor/status-bar` — colore coerente (#0F3D3E)
- `@capacitor/app` — back button Android, lifecycle, deep link
- `@capacitor/haptics` — feedback su task complete, swipe-delete, toggle
- `@capacitor/keyboard` — gestione tastiera
- `@capacitor/local-notifications` — notifiche native (sostituisce/affianca Web Notifications)
- `@capacitor/network` — detection offline nativa
- `@capacitor/share` — share nativo
- `@capacitor/ios` — supporto iOS

Aggiornare `capacitor.config.ts` con sezioni `plugins` (SplashScreen, LocalNotifications) e `ios`.

## 2. Adattamenti UI nativi

- **Safe areas**: estendere `env(safe-area-inset-*)` in `Navigation`, `HomePage`, `SettingsPage`, `AssistantPanel` (top per notch iOS, bottom gia presente)
- **Status bar**: in `App.tsx` impostare style `Light` su sfondo verde petrolio al boot
- **Splash**: configurare fade-out 500ms, sfondo `#0F3D3E`
- **Adaptive icon Android**: separare layer foreground/background

## 3. Lifecycle e back button

In `App.tsx` aggiungere listener `@capacitor/app`:
- `backButton`: chiude modali aperti, naviga indietro, exit app sulla home
- `appUrlOpen`: gestisce `com.ayvro.app://auth-callback`
- `resume`: invalida le query react-query per refresh dati

## 4. Notifiche native

Refactor `src/services/notificationService.ts`:
- Rilevare piattaforma via `Capacitor.isNativePlatform()`
- Su nativo usare `LocalNotifications.schedule()` (affidabile anche con app chiusa)
- Su web mantenere Web Notifications API esistente
- Permission flow nativo (richiesto Play Store)
- Action button "Completa" su notifiche task

## 5. Haptic feedback

In `TaskCard.tsx` e nei swipe-to-delete: `Haptics.impact({ style: ImpactStyle.Light })` su toggle, `Medium` su delete.

## 6. Network nativo

In `OfflineBanner.tsx`: usare `Network.addListener('networkStatusChange', ...)` su nativo, fallback a `navigator.onLine` su web.

## 7. Delete account (compliance store)

OBBLIGATORIO per Apple e Google:
- Edge function `delete-account` che cancella riga `auth.users` + dati correlati (cascade)
- UI in `SettingsPage`: bottone destructive con dialog conferma a doppio step (scrivi "ELIMINA")
- Chiavi i18n nelle 22 lingue

## 8. Documentazione build

Aggiornare README con:
```bash
npm run build
npx cap sync android   # o ios
npx cap open android   # apre Android Studio
```
Vincolo: AGP 8.11.1 (gia in memory).
Per iOS: richiede Mac con Xcode, comando `npx cap add ios` da eseguire localmente.

---

## Modifiche al database
1 sola migration: edge function `delete-account` con permission `service_role` per cancellare utente da `auth.users` (cascade gestisce le altre tabelle se i FK sono configurati). Verifico prima i FK esistenti.

## Cosa non cambia
- Codebase React unica per web/Android/iOS
- Brand, i18n, AI, auth Supabase invariati
- Le cartelle `android/` e `ios/` sono generate localmente dall'utente con `npx cap add` (non vivono nel repo Lovable)

## Ordine di implementazione
1. Install plugin + config
2. Lifecycle (back button, deep link, resume) + safe areas + status bar + splash
3. Haptic feedback
4. Notifiche native (refactor service)
5. Network nativo
6. Delete account (edge function + UI + i18n)
7. README aggiornato

