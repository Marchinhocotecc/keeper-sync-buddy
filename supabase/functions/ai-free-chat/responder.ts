/**
 * LAYER 6 — RESPONSE (template-based)
 * 
 * RESPONSIBILITY: Generate natural language replies.
 * NO logic, NO decisions — just text formatting.
 */

// ============================================================================
// GREETINGS
// ============================================================================

const GREETINGS = [
  "Ciao! Come posso aiutarti?",
  "Ehi! Dimmi pure.",
  "Buongiorno! Cosa posso fare per te?",
  "Ciao! Pronto ad organizzare la giornata?"
];

export function randomGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

// ============================================================================
// TRANSLATED REPLIES
// ============================================================================

const TRANSLATIONS: Record<string, Record<string, string>> = {
  it: {
    howCanIHelp: "Come posso aiutarti?",
    showTasks: "Mostra task",
    addEvent: "Aggiungi evento",
    showExpenses: "Mostra spese",
    cancelled: "Ok, annullato.",
    noTasks: "Non hai task 🎉",
    noEvents: "Non hai eventi 📅",
    advice: "Posso aiutarti a gestire task, eventi e spese. Prova: \"padel domani alle 20\" o \"sigarette €5\".",
  },
  en: {
    howCanIHelp: "How can I help you?",
    showTasks: "Show tasks",
    addEvent: "Add event",
    showExpenses: "Show expenses",
    cancelled: "Ok, cancelled.",
    noTasks: "No tasks 🎉",
    noEvents: "No events 📅",
    advice: "I can help you manage tasks, events and expenses. Try: \"meeting tomorrow at 3pm\" or \"lunch €12\".",
  },
  es: {
    howCanIHelp: "¿Cómo puedo ayudarte?",
    showTasks: "Mostrar tareas",
    addEvent: "Agregar evento",
    showExpenses: "Mostrar gastos",
    cancelled: "Ok, cancelado.",
    noTasks: "No tienes tareas 🎉",
    noEvents: "No tienes eventos 📅",
    advice: "Puedo ayudarte a gestionar tareas, eventos y gastos. Prueba: \"reunión mañana a las 15\" o \"almuerzo €12\".",
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
  if (pending.length === 0) return "Non hai task 🎉";
  return `📋 Task:\n` + pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
}

export function formatEventList(events: any[]): string {
  if (events.length === 0) return "Non hai eventi 📅";
  return `📅 Eventi:\n` + events.map((e: any, i: number) => {
    const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
    return `${i + 1}. ${e.title} — ${d}`;
  }).join("\n");
}

export function formatBudget(expenses: any[], budget: any): string {
  const total = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const budgetAmount = budget?.amount || 0;
  return `💰 Spese: €${total.toFixed(2)} / €${budgetAmount}`;
}
