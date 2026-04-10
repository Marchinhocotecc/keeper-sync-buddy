

## Piano: Semplificare e Rendere Intuitiva la UI/UX di Ayvro

### Problemi Identificati

Dopo analisi del codice e della struttura attuale, ecco le aree dove la UX puo migliorare significativamente:

---

### 1. HomePage — Troppo densa, poca gerarchia visiva

**Problema**: La home mostra 3 stat card + DailyNudge + insights (financial, weekly, monthly) + task list con 4 tab + WellnessCard. Tutto insieme, senza separazione chiara. L'utente non sa dove guardare.

**Azione**:
- Ridurre le stat card da 3 a un singolo "hero summary" compatto (es. riga unica: "3 task completati · 2 urgenti · €45 questa settimana")
- Spostare le tab dei task (today/upcoming/low/completed) in una vista piu semplice: mostrare solo i task "today" di default con un link "Vedi tutti" che espande
- Raggruppare DailyNudge + insights in una sezione "Per te" con scroll orizzontale su mobile

**File**: `HomePage.tsx`

---

### 2. AssistantPanel — Welcome screen troppo verbose

**Problema**: Lo schermo di benvenuto mostra icona + titolo + sottotitolo + 4 suggestion button impilati verticalmente. Occupa troppo spazio e sembra un tutorial, non un assistente pronto.

**Azione**:
- Ridurre il welcome a un singolo messaggio inline (come ChatGPT): avatar + "Ciao! Come posso aiutarti?"
- Mostrare le suggestion come chip orizzontali sotto l'input, non nel centro dello schermo
- Rimuovere la barra quick-actions (righe 487-498) quando ci sono gia suggestion nei messaggi — e' ridondante

**File**: `AssistantPanel.tsx`

---

### 3. ExpensesPage — Form troppo nascosto, chart poco utile

**Problema**: Il form per aggiungere spese e' in un Dialog modale — l'utente deve cliccare "Aggiungi", compilare, salvare. Troppi passaggi per un'azione frequente. Il pie chart mostra categorie ma non e' interattivo.

**Azione**:
- Aggiungere un "quick add" inline nella lista spese: campo importo + select categoria + bottone, tutto in una riga. Il Dialog resta per la versione completa (con data e note)
- Aggiungere al pie chart una legenda con importi reali sotto, non solo percentuali

**File**: `ExpensesPage.tsx`

---

### 4. Navigation — Icone senza contesto su mobile

**Problema**: La bottom bar mostra 5 icone con label molto piccole. Su schermi stretti le label si troncano.

**Azione**:
- Rimuovere le label dalla bottom bar mobile, tenere solo le icone (come Instagram/TikTok)
- Aggiungere un indicatore attivo piu evidente: dot sotto l'icona attiva invece del cambio colore testo
- Aumentare leggermente il touch target (da h-14 a h-16)

**File**: `Navigation.tsx`

---

### 5. Micro-interazioni mancanti

**Problema**: Le azioni (completa task, elimina spesa, cambia tab) non danno feedback visivo immediato. Solo toast notification.

**Azione**:
- Aggiungere animazione di uscita quando un task viene completato (slide-out a sinistra)
- Aggiungere haptic feedback pattern (vibrazione leggera) su toggle task e delete — gia supportato da Capacitor
- Aggiungere skeleton loading nei singoli componenti invece del loading generico della pagina

**File**: `TaskCard.tsx`, `ExpensesPage.tsx`

---

### 6. Contrasto e leggibilita

**Problema**: Alcuni testi `text-muted-foreground` su `bg-muted` hanno contrasto basso, specialmente in dark mode. Le stat card usano `text-2xl font-bold` che e' pesante visivamente.

**Azione**:
- Ridurre il font-weight delle stat card da `font-bold` a `font-semibold`
- Aumentare il contrasto di `muted-foreground` in dark mode (da 60% a 65%)
- Uniformare il border-radius: attualmente mix di `rounded-xl`, `rounded-[18px]`, `rounded-lg`, `rounded-md`

**File**: `index.css`, `HomePage.tsx`, `card.tsx`

---

### Ordine di implementazione consigliato

1. **Navigation mobile** — impatto immediato, pochi cambi
2. **AssistantPanel welcome** — riduce friction sulla pagina piu interattiva
3. **HomePage semplificazione** — riorganizzazione principale
4. **ExpensesPage quick-add** — velocizza l'azione piu frequente
5. **Micro-interazioni** — polish finale
6. **Contrasto e coerenza** — uniformita visiva

### Nessuna modifica al database

Tutte le modifiche sono frontend/CSS.

