/**
 * MODULE 3 + 4 — CONVERSATIONAL BRAIN + TRANSLATOR
 * 
 * Brain: Handles GENERAL_CHAT, PLANNING, and natural conversation.
 * Translator: Converts DecisionEngine JSON into human-friendly responses.
 * 
 * v3: Contextual fallbacks — NEVER says "Puoi specificare meglio?"
 *     Improved PLANNING with concrete suggestions.
 *     Memory-aware fallback responses.
 */

import { DecisionResult } from "./decisionEngine.ts";
import { callGroq } from "./groqClient.ts";

// ============================================================================
// CONVERSATION MEMORY TYPE
// ============================================================================

export interface ConversationMemory {
  lastIntent?: string;
  lastUserMessage?: string;
  lastAssistantResponse?: string;
}

// ============================================================================
// CONVERSATIONAL BRAIN
// ============================================================================

const BRAIN_PROMPT = `Sei Ayvro, assistente personale intelligente e concreto.

Puoi:
- spiegare decisioni finanziarie
- aiutare a pianificare la giornata con orari e suggerimenti concreti
- rispondere a saluti e conversazione casuale in modo amichevole
- spiegare cosa puoi fare quando l'utente chiede aiuto
- mantenere contesto conversazionale

Non generare JSON.
Non inventare numeri.
Se ricevi dati finanziari già calcolati, usali senza modificarli.

CAPACITÀ DA COMUNICARE (quando l'utente chiede "cosa puoi fare" o simile):
- Gestire task e to-do list
- Gestire eventi e calendario
- Registrare e analizzare spese
- Fornire analisi finanziarie e consigli sul budget
- Pianificare la giornata

REGOLE PER PLANNING:
- Se l'utente chiede quando allenarsi/fare qualcosa → proponi orari specifici basati sui task/eventi che ha
- Se l'utente ha eventi nel calendario → suggerisci slot liberi
- Se non hai dati → chiedi "A che ora sei solitamente libero?" o "Preferisci mattina o sera?"
- Dai SEMPRE almeno un suggerimento concreto con un orario

REGOLE PER FOLLOW-UP:
- Se l'utente chiede "perché?" → spiega la risposta precedente in dettaglio
- Se l'utente chiede "come mai?" → analizza il ragionamento precedente
- Usa il contesto della conversazione precedente per risposte coerenti

REGOLE PER SALUTI:
- Rispondi in modo amichevole e breve
- Proponi cosa puoi fare

REGOLE CRITICHE:
- NON dire MAI "Puoi specificare meglio?" o "Non ho capito" o "Non ho abbastanza informazioni"
- Se sei in dubbio → fai una DOMANDA INTELLIGENTE E CONTESTUALE
- Rispondi SEMPRE in modo utile, anche con informazioni parziali
- Massimo 2-3 frasi
- Rispondi nella lingua dell'utente`;

export async function conversationalReply(
  userMessage: string,
  userLang: string = 'it',
  context?: { todos?: any[]; events?: any[]; financialSummary?: string },
  memory?: ConversationMemory
): Promise<string> {
  let contextBlock = '';

  // Add conversation memory for coherent follow-ups
  if (memory?.lastUserMessage && memory?.lastAssistantResponse) {
    contextBlock += `\nConversazione precedente:`;
    contextBlock += `\n- Utente: "${memory.lastUserMessage}"`;
    contextBlock += `\n- Assistente: "${memory.lastAssistantResponse}"`;
    if (memory.lastIntent) {
      contextBlock += `\n- Intent precedente: ${memory.lastIntent}`;
    }
  }

  if (context) {
    if (context.todos?.length) {
      const pending = context.todos.filter(t => !t.completed);
      if (pending.length > 0) {
        contextBlock += `\nTask pendenti: ${pending.map(t => t.title).join(', ')}`;
      }
    }
    if (context.events?.length) {
      contextBlock += `\nProssimi eventi: ${context.events.map(e => `${e.title} (${new Date(e.start_time).toLocaleDateString()})`).join(', ')}`;
    }
    if (context.financialSummary) {
      contextBlock += `\nContesto finanziario: ${context.financialSummary}`;
    }
  }

  const userPrompt = `${contextBlock ? `Contesto:${contextBlock}\n\n` : ''}Utente (lingua: ${userLang}): ${userMessage}`;

  try {
    return await callGroq({
      systemPrompt: BRAIN_PROMPT,
      userPrompt,
      maxTokens: 300,
      temperature: 0.5,
      timeoutMs: 20000,
    });
  } catch (err) {
    console.error("[BRAIN] Groq call failed:", err instanceof Error ? err.message : err);
    return getContextualFallback(userLang, memory, context);
  }
}

// ============================================================================
// CONTEXTUAL FALLBACK — NEVER says "Puoi specificare meglio?"
// ============================================================================

function getContextualFallback(
  lang: string,
  memory?: ConversationMemory,
  context?: { todos?: any[]; events?: any[]; financialSummary?: string }
): string {
  // If last intent was FINANCIAL → offer financial follow-up
  if (memory?.lastIntent?.includes('FINANCIAL')) {
    const responses: Record<string, string> = {
      it: "Vuoi che approfondisca l'analisi delle spese o hai una domanda specifica sul budget?",
      en: "Would you like me to dig deeper into your spending analysis or do you have a specific budget question?",
      es: "¿Quieres que profundice en el análisis de gastos o tienes una pregunta específica sobre el presupuesto?",
      fr: "Veux-tu que j'approfondisse l'analyse des dépenses ou as-tu une question spécifique sur le budget ?",
      de: "Soll ich die Ausgabenanalyse vertiefen oder hast du eine spezifische Budgetfrage?",
    };
    return responses[lang] || responses['en'];
  }

  // If last intent was TASK → offer task help
  if (memory?.lastIntent === 'TASK_QUERY') {
    const responses: Record<string, string> = {
      it: "Vuoi che ti aiuti a organizzare i task o crearne uno nuovo?",
      en: "Would you like help organizing your tasks or creating a new one?",
      es: "¿Quieres que te ayude a organizar las tareas o crear una nueva?",
      fr: "Veux-tu que je t'aide à organiser les tâches ou en créer une nouvelle ?",
      de: "Soll ich dir helfen, deine Aufgaben zu organisieren oder eine neue zu erstellen?",
    };
    return responses[lang] || responses['en'];
  }

  // If last intent was EVENT → offer event help
  if (memory?.lastIntent === 'EVENT_QUERY') {
    const responses: Record<string, string> = {
      it: "Vuoi creare un nuovo evento o hai bisogno di gestire il calendario?",
      en: "Would you like to create a new event or manage your calendar?",
      es: "¿Quieres crear un nuevo evento o gestionar tu calendario?",
      fr: "Veux-tu créer un nouvel événement ou gérer ton calendrier ?",
      de: "Möchtest du ein neues Event erstellen oder deinen Kalender verwalten?",
    };
    return responses[lang] || responses['en'];
  }

  // If we have context with tasks/events → reference them
  if (context?.todos?.length || context?.events?.length) {
    const pendingTasks = context?.todos?.filter(t => !t.completed)?.length || 0;
    const upcomingEvents = context?.events?.length || 0;

    if (pendingTasks > 0 && lang === 'it') {
      return `Hai ${pendingTasks} task in sospeso. Vuoi che ti aiuti a organizzarli o preferisci fare altro?`;
    }
    if (upcomingEvents > 0 && lang === 'it') {
      return `Hai ${upcomingEvents} eventi in programma. Serve aiuto con il calendario o con altro?`;
    }
  }

  // Default: friendly and helpful (NEVER "non ho capito")
  const defaults: Record<string, string> = {
    it: "Come posso aiutarti? Posso gestire task, eventi, spese e darti consigli sul budget.",
    en: "How can I help you? I can manage tasks, events, expenses and give you budget advice.",
    es: "¿Cómo puedo ayudarte? Puedo gestionar tareas, eventos, gastos y darte consejos sobre el presupuesto.",
    fr: "Comment puis-je t'aider ? Je peux gérer les tâches, événements, dépenses et te conseiller sur ton budget.",
    de: "Wie kann ich dir helfen? Ich kann Aufgaben, Termine, Ausgaben verwalten und Budgetberatung geben.",
  };
  return defaults[lang] || defaults['en'];
}

// ============================================================================
// TRANSLATOR (Decision → Natural language)
// ============================================================================

const TRANSLATOR_PROMPT = `Ricevi un oggetto JSON con:

- summary
- reasoning
- actions[]
- decision_type (affordability | status_report | diagnostic | general)
- verdict (solo per affordability: "si" o "no")

Trasformalo in una risposta naturale per l'utente.

REGOLE PER TIPO:
- affordability: inizia con "Sì, puoi..." o "No, al momento..." in base al verdict
- status_report: dai una panoramica chiara con trend
- diagnostic: evidenzia la categoria problematica
- general: riassumi e suggerisci

Mantieni:
- chiarezza
- concretezza
- suggerimenti pratici

Non inventare nuove azioni.
Non cambiare il significato.
Non generare JSON.
Massimo 2-3 frasi. Sii diretto.`;

export async function translateDecision(
  decision: DecisionResult,
  userLang: string = 'it'
): Promise<string> {
  const userPrompt = `Lingua: ${userLang}

Decision JSON:
${JSON.stringify(decision, null, 2)}`;

  try {
    return await callGroq({
      systemPrompt: TRANSLATOR_PROMPT,
      userPrompt,
      maxTokens: 200,
      temperature: 0.3,
      timeoutMs: 15000,
    });
  } catch (err) {
    console.error("[TRANSLATOR] Groq call failed:", err instanceof Error ? err.message : err);
    return deterministicTranslation(decision);
  }
}

function deterministicTranslation(decision: DecisionResult): string {
  let result = decision.summary;
  
  const realActions = decision.actions.filter(a => a.type !== 'none');
  if (realActions.length > 0) {
    result += ' ' + realActions.map(a => `${a.title}: ${a.description}`).join(' ');
  }

  return result;
}
