

# Modifica capacitor.config.ts per Produzione

## Modifiche

**File:** `capacitor.config.ts`

- `appId`: da `app.lovable.f28d224c938f4431bf9193819af85fa5` → `io.ayro.app` (coerente con il deep linking già configurato)
- Rimozione blocco `server.url` (l'app userà gli asset locali da `dist/` invece del preview server)
- `allowMixedContent`: da `true` → `false` (sicurezza produzione)

### Risultato finale

```typescript
const config: CapacitorConfig = {
  appId: 'io.ayro.app',
  appName: 'Ayro',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};
```

### Dopo la modifica

Comandi da eseguire in locale:

```bash
npm run build
npx cap sync android
npx cap open android
```

Poi in Android Studio: **Build → Build APK(s)**.

