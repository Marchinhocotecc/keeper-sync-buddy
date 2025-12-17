/**
 * Suggestion Engine - Domain-strict suggestions
 * 
 * Rules:
 * - MUST respect domain from Decision Object
 * - MUST respect constraints (exclusions, previous suggestions)
 * - NEVER mix domains
 * - NEVER show quick actions
 */

import type { DecisionObject, DomainType, Constraints } from './decisionEngine';
import { trackSuggestion } from './decisionEngine';

interface DomainSuggestions {
  domain: DomainType;
  suggestions: string[];
}

const DOMAIN_SUGGESTIONS: DomainSuggestions[] = [
  {
    domain: 'productivity',
    suggestions: [
      'Completa il task più urgente in sospeso',
      'Dedica 25 minuti a un progetto importante (tecnica Pomodoro)',
      'Organizza la tua lista task per priorità',
      'Blocca 1 ora per lavoro profondo senza distrazioni',
      'Rivedi i task completati questa settimana',
      'Pianifica i 3 task principali per domani',
      'Archivia i task vecchi non più rilevanti',
      'Crea un task per qualcosa che stai rimandando'
    ]
  },
  {
    domain: 'wellness',
    suggestions: [
      'Fai una pausa di 10 minuti e cammina',
      'Prova 5 minuti di respirazione profonda',
      'Bevi un bicchiere d\'acqua',
      'Stretching di 5 minuti alla scrivania',
      'Fai una breve meditazione guidata',
      'Esci per prendere aria fresca',
      'Disconnettiti dagli schermi per 15 minuti',
      'Ascolta una canzone che ti rilassa'
    ]
  },
  {
    domain: 'finance',
    suggestions: [
      'Registra le spese di oggi',
      'Controlla il budget rimanente del mese',
      'Rivedi le spese della settimana',
      'Identifica una spesa che puoi ridurre',
      'Pianifica il budget per la prossima settimana',
      'Controlla abbonamenti attivi non utilizzati',
      'Imposta un obiettivo di risparmio',
      'Categorizza le spese non classificate'
    ]
  },
  {
    domain: 'planning',
    suggestions: [
      'Controlla gli eventi di oggi',
      'Pianifica gli appuntamenti della settimana',
      'Blocca tempo per attività importanti',
      'Rivedi il calendario per conflitti',
      'Prepara l\'agenda per domani',
      'Schedula una chiamata che stai rimandando',
      'Crea un evento per una scadenza importante',
      'Sincronizza i tuoi impegni personali e professionali'
    ]
  },
  {
    domain: 'social',
    suggestions: [
      'Chiama un amico o familiare',
      'Rispondi a messaggi in sospeso',
      'Organizza un\'uscita con amici',
      'Scrivi un messaggio a qualcuno che non senti da tempo',
      'Pianifica una cena in famiglia',
      'Fai un complimento a un collega'
    ]
  }
];

/**
 * Get suggestions strictly respecting domain and constraints
 */
export function getSuggestionsForDecision(
  userId: string,
  decision: DecisionObject
): string[] {
  if (decision.intent !== 'SUGGESTION') {
    return [];
  }

  const { domain, constraints } = decision;
  
  if (!domain) {
    console.error('No domain specified for SUGGESTION');
    return [];
  }

  // Get domain-specific suggestions
  const domainSuggestions = DOMAIN_SUGGESTIONS.find(d => d.domain === domain);
  
  if (!domainSuggestions) {
    console.error('Unknown domain:', domain);
    return getGenericSuggestions(constraints);
  }

  // Filter by constraints
  let filtered = [...domainSuggestions.suggestions];

  // Remove previously shown
  if (constraints.previousSuggestions?.length) {
    filtered = filtered.filter(s => 
      !constraints.previousSuggestions!.some(prev => 
        s.toLowerCase().includes(prev.toLowerCase()) ||
        prev.toLowerCase().includes(s.toLowerCase())
      )
    );
  }

  // Shuffle to vary order
  filtered = shuffleArray(filtered);

  // Take top 3
  const selected = filtered.slice(0, 3);

  // Track what we're showing
  selected.forEach(s => trackSuggestion(userId, s));

  // If we've exhausted the domain, provide a meta-suggestion
  if (selected.length < 3) {
    selected.push(`Prova a esplorare un altro ambito come ${getAlternativeDomain(domain, constraints)}`);
  }

  return selected;
}

function getGenericSuggestions(constraints: Constraints): string[] {
  const generic = [
    'Cosa vuoi che ti aiuti a fare?',
    'Puoi chiedermi di mostrarti task, eventi o spese',
    'Posso aiutarti a organizzare la giornata'
  ];

  return generic.slice(0, 3);
}

function getAlternativeDomain(current: DomainType, constraints: Constraints): string {
  const excluded = constraints.excludeDomains || [];
  const alternatives: Partial<Record<NonNullable<DomainType>, string>> = {
    productivity: 'benessere o finanze',
    task: 'benessere o finanze',
    wellness: 'produttività o pianificazione',
    finance: 'benessere o produttività',
    expense: 'benessere o produttività',
    planning: 'produttività o relax',
    calendar: 'produttività o relax',
    social: 'produttività o benessere',
    general: 'task o eventi'
  };

  if (current && alternatives[current]) {
    return alternatives[current];
  }
  return 'task o eventi';
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Build suggestion response message
 */
export function buildSuggestionResponse(
  suggestions: string[],
  domain: DomainType
): string {
  if (suggestions.length === 0) {
    return 'Non ho altri suggerimenti per questo ambito. Vuoi esplorare qualcos\'altro?';
  }

  const domainIntros: Partial<Record<NonNullable<DomainType>, string[]>> = {
    productivity: ['Per la produttività:', 'Ecco cosa puoi fare:', 'Sul fronte lavoro:'],
    task: ['Per i tuoi task:', 'Ecco cosa puoi fare:', 'Sul fronte lavoro:'],
    wellness: ['Per il tuo benessere:', 'Prenditi cura di te:', 'Per rilassarti:'],
    finance: ['Per le tue finanze:', 'Lato economico:', 'Per il budget:'],
    expense: ['Per le tue spese:', 'Lato economico:', 'Per il budget:'],
    planning: ['Per organizzarti:', 'Per la pianificazione:', 'Per il tuo calendario:'],
    calendar: ['Per il calendario:', 'Per la pianificazione:', 'Per i tuoi eventi:'],
    social: ['Per le relazioni:', 'Sul fronte sociale:', 'Per connetterti:'],
    general: ['Ecco alcune idee:', 'Ti suggerisco:', 'Prova una di queste:']
  };

  const intros = domain ? domainIntros[domain] || domainIntros.general : domainIntros.general;
  const intro = intros[Math.floor(Math.random() * intros.length)];

  const list = suggestions
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

  return `${intro}\n\n${list}`;
}
