/**
 * Suggestions Engine - Generates contextual suggestions
 */

import { format, getHours, isWeekend } from 'date-fns';
import { it } from 'date-fns/locale';
import type { EngineOutput, UserContext, TimeSlot } from './types';
import { getContext } from './contextStore';
import { runAllRules, findFreeTimeSlots } from './rulesEngine';
import { getUserPatterns, predictBestTimeSlots, predictWeaknesses } from './habitsEngine';

/**
 * Get time-based greeting
 */
function getTimeBasedGreeting(): string {
  const hour = getHours(new Date());
  
  if (hour < 6) return 'Buonanotte';
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  if (hour < 22) return 'Buonasera';
  return 'Buonanotte';
}

/**
 * Generate time-based suggestions
 */
function getTimeBasedSuggestions(): EngineOutput[] {
  const now = new Date();
  const hour = getHours(now);
  const suggestions: EngineOutput[] = [];
  const weekend = isWeekend(now);

  // Morning suggestions (6-11)
  if (hour >= 6 && hour < 11) {
    suggestions.push({
      type: 'suggestion',
      title: 'Pianifica la giornata',
      message: 'È un buon momento per rivedere i tuoi task e priorità di oggi.',
      relevance: 0.7
    });

    if (!weekend) {
      suggestions.push({
        type: 'suggestion',
        title: 'Focus mattutino',
        message: 'La mattina è il momento ideale per i task più impegnativi.',
        relevance: 0.6
      });
    }
  }

  // Lunch time (12-14)
  if (hour >= 12 && hour < 14) {
    suggestions.push({
      type: 'suggestion',
      title: 'Pausa pranzo',
      message: 'Ricordati di fare una pausa e ricaricare le energie!',
      relevance: 0.5
    });
  }

  // Afternoon (14-17)
  if (hour >= 14 && hour < 17) {
    suggestions.push({
      type: 'suggestion',
      title: 'Revisione pomeridiana',
      message: 'Controlla come sta andando la giornata e cosa resta da fare.',
      relevance: 0.6
    });
  }

  // Evening (18-22)
  if (hour >= 18 && hour < 22) {
    suggestions.push({
      type: 'suggestion',
      title: 'Pianifica domani',
      message: 'È un buon momento per preparare la lista dei task per domani.',
      relevance: 0.7
    });

    suggestions.push({
      type: 'suggestion',
      title: 'Controlla le spese',
      message: 'Hai registrato tutte le spese di oggi?',
      relevance: 0.5
    });
  }

  return suggestions;
}

/**
 * Generate suggestions based on free time slots
 */
async function getFreeTimeSuggestions(userId: string, context: UserContext): Promise<EngineOutput[]> {
  const suggestions: EngineOutput[] = [];
  const freeSlots = await findFreeTimeSlots(userId, context);

  if (freeSlots.length > 0) {
    const bestSlot = freeSlots.sort((a, b) => b.quality - a.quality)[0];
    
    if (bestSlot.duration >= 60) {
      suggestions.push({
        type: 'suggestion',
        title: 'Tempo libero',
        message: `Hai un'ora libera dalle ${bestSlot.start} alle ${bestSlot.end}. Vuoi che ti proponga un'attività?`,
        relevance: 0.75,
        actionable: true
      });
    } else if (bestSlot.duration >= 30) {
      suggestions.push({
        type: 'suggestion',
        title: 'Slot disponibile',
        message: `Hai ${bestSlot.duration} minuti liberi dalle ${bestSlot.start}. Potresti completare un task veloce.`,
        relevance: 0.6
      });
    }
  }

  return suggestions;
}

/**
 * Generate pattern-based suggestions
 */
async function getPatternBasedSuggestions(userId: string): Promise<EngineOutput[]> {
  const suggestions: EngineOutput[] = [];
  const patterns = await getUserPatterns(userId);
  const weaknesses = await predictWeaknesses(userId);

  // Add weakness-based suggestions
  for (const weakness of weaknesses.slice(0, 2)) {
    suggestions.push({
      type: 'insight',
      title: 'Area di miglioramento',
      message: weakness,
      relevance: 0.7
    });
  }

  // Add pattern-based suggestions
  for (const pattern of patterns.slice(0, 2)) {
    if (pattern.confidence > 0.6) {
      suggestions.push({
        type: 'insight',
        title: 'Il tuo pattern',
        message: pattern.description,
        relevance: 0.5
      });
    }
  }

  return suggestions;
}

/**
 * Generate smart suggestions based on all available data
 */
export async function generateSmartSuggestions(userId: string): Promise<EngineOutput[]> {
  const context = await getContext(userId);
  
  // Gather all suggestions
  const [ruleInsights, timeBasedSuggestions, freeTimeSuggestions, patternSuggestions] = 
    await Promise.all([
      runAllRules(userId, context),
      Promise.resolve(getTimeBasedSuggestions()),
      getFreeTimeSuggestions(userId, context),
      getPatternBasedSuggestions(userId)
    ]);

  // Combine all suggestions
  const allSuggestions = [
    ...ruleInsights,
    ...timeBasedSuggestions,
    ...freeTimeSuggestions,
    ...patternSuggestions
  ];

  // Deduplicate by title and sort by relevance
  const seen = new Set<string>();
  const uniqueSuggestions = allSuggestions.filter(s => {
    if (seen.has(s.title)) return false;
    seen.add(s.title);
    return true;
  });

  return uniqueSuggestions.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
}

/**
 * Get contextual greeting with suggestions
 */
export async function getContextualGreeting(userId: string): Promise<{
  greeting: string;
  context: string;
  suggestions: EngineOutput[];
}> {
  const context = await getContext(userId);
  const greeting = getTimeBasedGreeting();
  const today = format(new Date(), 'EEEE d MMMM', { locale: it });

  const suggestions = await generateSmartSuggestions(userId);
  const topSuggestions = suggestions.slice(0, 3);

  // Build context message
  let contextMessage = `Oggi è ${today}.`;
  
  const alerts = topSuggestions.filter(s => s.type === 'alert');
  if (alerts.length > 0) {
    contextMessage += ` ${alerts[0].message}`;
  }

  return {
    greeting: `${greeting}! 👋`,
    context: contextMessage,
    suggestions: topSuggestions
  };
}

/**
 * Get quick action suggestions based on context
 */
export function getQuickActionSuggestions(): string[] {
  const hour = getHours(new Date());
  
  if (hour < 12) {
    return [
      'Mostra i task di oggi',
      'Cosa ho in calendario?',
      'Aggiungi un task'
    ];
  } else if (hour < 18) {
    return [
      'Quanto ho speso oggi?',
      'Task rimanenti',
      'Prossimo evento'
    ];
  } else {
    return [
      'Riepilogo della giornata',
      'Pianifica domani',
      'Registra una spesa'
    ];
  }
}
