

# Internazionalizzazione Completa: da 3 a 22+ Lingue

## Situazione Attuale
- 3 lingue supportate: Italiano (it), English (en), Espanol (es)
- 3 file JSON di traduzione in `src/i18n/locales/`
- Selettore lingua in SettingsPage con 3 opzioni
- AI assistant (responder.ts) supporta solo it/en/es

## Lingue da Aggiungere (19 nuove)

| Codice | Lingua | Codice | Lingua |
|--------|--------|--------|--------|
| ru | Russo | pl | Polacco |
| fr | Francese | sv | Svedese |
| de | Tedesco | no | Norvegese |
| nl | Olandese | da | Danese |
| hr | Croato | lt | Lituano |
| sq | Albanese | lv | Lettone |
| ro | Romeno | et | Estone |
| zh | Cinese | pt | Portoghese |
| ja | Giapponese | ko | Coreano |
| hi | Hindi | | |

## Modifiche Necessarie

### 1. Creare 19 file di traduzione
Per ogni nuova lingua, creare `src/i18n/locales/{codice}.json` con la stessa struttura di `en.json` (~168 righe), tradotto nella lingua corretta.

### 2. Aggiornare `src/i18n/config.ts`
- Importare tutti i 22 file JSON
- Registrarli nell'oggetto `resources` di i18next

### 3. Aggiornare `src/pages/SettingsPage.tsx`
- Espandere il `<Select>` delle lingue da 3 a 22 opzioni con bandiera emoji e nome nella lingua nativa

### 4. Aggiornare `supabase/functions/ai-free-chat/responder.ts`
- Aggiungere le traduzioni per le risposte dell'assistente AI (greetings, translated replies, default suggestions) per tutte le 22 lingue
- Aggiornare i formatters per usare la locale corretta

### 5. Deploy Edge Function
- Re-deploy `ai-free-chat` per attivare le nuove risposte multilingue

## Note Tecniche
- Ogni file JSON contiene circa 90 chiavi di traduzione
- Le traduzioni saranno accurate e nella lingua nativa (non traduzioni automatiche approssimative)
- Il sistema i18next gestisce gia' il fallback su `en` se una chiave manca
- L'AI assistant usera' la lingua dell'utente (dalle settings) per le risposte deterministiche del router
- Nessuna modifica al database necessaria (il campo `language` in settings e' gia' un testo libero)

