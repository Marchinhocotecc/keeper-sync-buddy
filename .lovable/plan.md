

## Stato Attuale: ~8.7/10

L'app e' solida: i18n quasi completo, navigazione pulita, UX semplificata, delete confirmations, empty states, animazioni task. Manca il polish finale che fa dire "questo vale i miei soldi".

Per un utente che paga, servono 3 cose: **percezione di valore**, **fluidita senza frizioni**, e **dettagli curati**.

---

## Piano: Ayvro 8.7 → 9.5/10

### 1. Greeting personalizzato e ora del giorno
**Problema**: Il saluto in HomePage e' generico (`t('home.greeting', { name })`). Non cambia mai.

**Azione**: Variare il saluto in base all'ora: "Buongiorno Marco", "Buon pomeriggio", "Buonasera". Aggiungere chiavi `home.greetingMorning`, `home.greetingAfternoon`, `home.greetingEvening` ai locale.

**File**: `HomePage.tsx`, tutti i `locales/*.json`

---

### 2. Valuta dinamica (non hardcoded €)
**Problema**: L'app usa `€` hardcoded ovunque (HomePage hero, ExpensesPage, pie chart). Un utente non-europeo vede l'euro anche se usa dollari.

**Azione**: Leggere la valuta dalle settings utente (o default da locale). Usare `Intl.NumberFormat` con la valuta corretta. Aggiungere un campo `currency` nelle settings se non esiste.

**File**: `HomePage.tsx`, `ExpensesPage.tsx`, `SettingsPage.tsx`, `en.json`

---

### 3. Pull-to-refresh su mobile
**Problema**: Non c'e' modo di ricaricare i dati senza navigare via e tornare. In un'app mobile-first e' frustrante.

**Azione**: Aggiungere pull-to-refresh sulla HomePage e ExpensesPage usando un componente custom leggero (touch events + invalidateQueries).

**File**: nuovo `src/components/PullToRefresh.tsx`, `HomePage.tsx`, `ExpensesPage.tsx`

---

### 4. Swipe-to-delete su task e spese
**Problema**: Per eliminare un task/spesa bisogna trovare il bottoncino cestino, cliccare, confermare. Troppi tap per un'azione comune su mobile.

**Azione**: Aggiungere swipe-left per rivelare il bottone delete su `TaskCard` e sulle righe spese. Il gesto e' naturale su mobile e riduce l'attrito.

**File**: `TaskCard.tsx`, `ExpensesPage.tsx`

---

### 5. Toast di conferma spesa con "Annulla"
**Problema**: Dopo aver aggiunto una spesa con quick-add, il toast dice solo "Aggiunto". L'utente non puo' annullare se ha sbagliato importo.

**Azione**: Aggiungere un bottone "Annulla" nel toast che elimina l'ultima spesa aggiunta entro 5 secondi. Pattern undo familiare (Gmail, Google Keep).

**File**: `ExpensesPage.tsx`

---

### 6. Streak/progresso visivo in HomePage
**Problema**: L'utente non ha un senso di progresso giornaliero. Nessun motivo per tornare ogni giorno.

**Azione**: Aggiungere un indicatore di streak ("3 giorni consecutivi di task completati") o una barra di progresso giornaliera ("2/5 task di oggi completati") nell'hero summary.

**File**: `HomePage.tsx`

---

### 7. Transizioni tra pagine
**Problema**: Le pagine appaiono istantaneamente senza transizione. Sembra un sito web, non un'app.

**Azione**: Aggiungere fade-in leggero (150ms) al mount di ogni pagina principale usando framer-motion `AnimatePresence` nel router.

**File**: `App.tsx` o wrapper component

---

## Ordine di implementazione

1. Greeting personalizzato (rapido, impatto emotivo)
2. Streak/progresso (retention)
3. Transizioni pagine (percezione qualita')
4. Valuta dinamica (internazionalizzazione reale)
5. Pull-to-refresh (mobile-first)
6. Swipe-to-delete (mobile UX)
7. Undo toast spese (riduzione errori)

## Nessuna modifica al database

Tutto frontend. La valuta si salva nelle settings gia' esistenti.

