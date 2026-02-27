

# Rebranding Audit: cosa manca

Il rebranding precedente ha coperto la maggior parte dei file, ma restano **residui concreti** da correggere:

## Residui "Ayro" da eliminare

### 1. README.md — tutto il file è ancora "Ayro"
- Nome, tagline, colore primario (#4C4EFF), sfondo (#1F242C) tutti vecchi

### 2. ExpensesPage.tsx — palette grafici ancora blu
- `COLORS = ['#4C4EFF', '#5B8CFF', '#76A4FF', ...]` — blu Ayro, va sostituita con tonalità teal coerenti

### 3. TermsAndConditionsPage.tsx — 2 riferimenti "Ayro"
- "Ayro è un'applicazione..." (riga 42)
- "support@ayro.app" (riga 99)

### 4. AcceptTermsPage.tsx — 2 riferimenti "Ayro"
- "Benvenuto in Ayro!" (riga 39)
- "Per continuare a usare Ayro" (riga 71)
- Classe CSS `ayro-button` (riga 113)

### 5. Edge function index.ts — 15+ console.log con `[Ayro]`
- Tutti i log dicono `[Ayro]` invece di `[Ayvro]`

### 6. tailwind.config.ts — shadow legacy aliases "ayro"
- `ayro`, `ayro-card`, `ayro-nav`, `ayro-glow` — da rimuovere o rinominare

### 7. index.css — classi legacy `.ayro-*`
- `.ayro-glow`, `.shadow-ayro`, `.shadow-ayro-card`, `.shadow-ayro-nav`, `.ayro-button`, `.ayro-active`

### 8. Componenti UI con classi `ayro-*`
- `card.tsx`: `shadow-ayro-card`
- `tabs.tsx`: `ayro-glow`
- `select.tsx`: `shadow-ayro-card`
- `dialog.tsx`: `shadow-ayro-card`
- `popover.tsx`: probabile `shadow-ayro-card`
- `TaskCard.tsx`: `shadow-ayro`
- `AcceptTermsPage.tsx`: `ayro-button`

## Piano di implementazione

### Task 1: Aggiornare README.md
Riscrivere con branding Ayvro, palette teal, tagline corretta.

### Task 2: Sostituire palette grafici in ExpensesPage.tsx
Usare tonalità teal: `#0F3D3E`, `#145A5B`, `#1E6F70`, `#2E7D32`, `#E6A23C`, `#D64545`, `#6B7280`.

### Task 3: Fix TermsAndConditionsPage.tsx e AcceptTermsPage.tsx
Sostituire "Ayro" → "Ayvro" e "support@ayro.app" → "support@ayvro.app".

### Task 4: Fix console.log nella edge function
Sostituire tutti i `[Ayro]` con `[Ayvro]`.

### Task 5: Cleanup CSS/Tailwind legacy aliases
- In `tailwind.config.ts`: rimuovere le shadow `ayro-*` legacy
- In `index.css`: rimuovere le classi `.ayro-*` legacy
- Nei componenti UI: sostituire `ayro-card` → `ayvro-card`, `ayro-glow` → `ayvro-glow`, `ayro-button` → `ayvro-button`, `shadow-ayro` → `shadow-ayvro` (o usare direttamente le nuove classi `ayvro-*` già definite)

