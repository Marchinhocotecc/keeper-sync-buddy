/**
 * LAYER 6 — RESPONSE (template-based)
 * 
 * RESPONSIBILITY: Generate natural language replies.
 * NO logic, NO decisions — just text formatting.
 * 
 * TONE: Concise, neutral, human. No emojis. No filler.
 */

// ============================================================================
// GREETINGS
// ============================================================================

const GREETINGS: Record<string, string[]> = {
  it: ["Ciao. Dimmi.", "Ciao. Come posso aiutarti?"],
  en: ["Hi. What do you need?", "Hi. How can I help?"],
  es: ["Hola. Dime.", "Hola. En que puedo ayudarte?"],
};

export function randomGreeting(lang = "it"): string {
  const list = GREETINGS[lang] || GREETINGS["it"];
  return list[Math.floor(Math.random() * list.length)];
}

// ============================================================================
// TRANSLATED REPLIES
// ============================================================================

const TRANSLATIONS: Record<string, Record<string, string>> = {
  it: {
    howCanIHelp: "Dimmi.",
    showTasks: "Mostra task",
    addEvent: "Aggiungi evento",
    showExpenses: "Mostra spese",
    cancelled: "Ok, annullato.",
    noTasks: "Nessun task.",
    noEvents: "Nessun evento.",
    advice: "Posso gestire task, eventi e spese. Prova: \"padel domani alle 20\" o \"sigarette 5 euro\".",
    done: "Fatto.",
    missingTime: "Manca l'orario. Me lo dici?",
    missingDate: "Manca la data. Quando?",
    missingAmount: "Manca l'importo. Quanto?",
  },
  en: {
    howCanIHelp: "What do you need?",
    showTasks: "Show tasks",
    addEvent: "Add event",
    showExpenses: "Show expenses",
    cancelled: "Ok, cancelled.",
    noTasks: "No tasks.",
    noEvents: "No events.",
    advice: "I can manage tasks, events and expenses. Try: \"meeting tomorrow at 3pm\" or \"lunch 12 euros\".",
    done: "Done.",
    missingTime: "What time?",
    missingDate: "What date?",
    missingAmount: "How much?",
  },
  es: {
    howCanIHelp: "Dime.",
    showTasks: "Mostrar tareas",
    addEvent: "Agregar evento",
    showExpenses: "Mostrar gastos",
    cancelled: "Ok, cancelado.",
    noTasks: "Sin tareas.",
    noEvents: "Sin eventos.",
    advice: "Puedo gestionar tareas, eventos y gastos. Prueba: \"reunion manana a las 15\" o \"almuerzo 12 euros\".",
    done: "Hecho.",
    missingTime: "A que hora?",
    missingDate: "Que dia?",
    missingAmount: "Cuanto?",
  }
};

export function t(lang: string, key: string): string {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS["it"][key] || key;
}

export function defaultSuggestions(lang: string): string[] {
  return [t(lang, "showTasks"), t(lang, "addEvent"), t(lang, "showExpenses")];
}

// ============================================================================
// QUERY FORMATTERS
// ============================================================================

export function formatTaskList(todos: any[]): string {
  const pending = todos.filter((t: any) => !t.completed);
  if (pending.length === 0) return "Nessun task.";
  return pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
}

export function formatEventList(events: any[]): string {
  if (events.length === 0) return "Nessun evento.";
  return events.map((e: any, i: number) => {
    const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
    return `${i + 1}. ${e.title} — ${d}`;
  }).join("\n");
}

export function formatBudget(expenses: any[], budget: any): string {
  const total = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const budgetAmount = budget?.amount || 0;
  return `Spese: ${total.toFixed(2)} / ${budgetAmount} euro.`;
}
