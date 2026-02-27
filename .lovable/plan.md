

## Problema

Capacitor non accetta `npx cap init` quando esiste già un file `capacitor.config.ts`. Ma il file è già corretto e completo — non serve fare `cap init`.

## Soluzione

Il file `capacitor.config.ts` è già configurato correttamente con:
- `appId: 'com.ayvro.app'`
- `appName: 'Ayvro'`
- `webDir: 'dist'`

**Non devi eseguire `npx cap init`** — è già stato fatto. Quel comando serve solo per creare il config file, che esiste già.

## Passi per generare l'APK

Esegui questi comandi in ordine nella cartella del progetto:

```text
1. npm install
2. npx cap add android          (solo la prima volta)
3. npm run build
4. npx cap sync
5. npx cap open android          (apre Android Studio)
```

In Android Studio:
- Build → Build Bundle(s) / APK(s) → Build APK(s)

Se hai già la cartella `android/`, salta il passo 2 e parti da `npm run build`.

## Nessuna modifica al codice necessaria

Il `capacitor.config.ts` attuale è già in configurazione production (nessun `server.url`, `allowMixedContent: false`). Non serve toccare nulla.

