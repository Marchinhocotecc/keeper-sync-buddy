/**
 * Response Generator - Generazione risposte naturali e motivanti
 */

import { formatDateForDisplay, formatTimeForDisplay } from './nlp/dateTimeParser';

export interface ResponseOptions {
  intent: string;
  success: boolean;
  data?: any;
  error?: string;
  confidence?: 'high' | 'medium' | 'low';
  alternatives?: string[];
}

export function generateResponse(options: ResponseOptions): string {
  const { intent, success, data, error, confidence, alternatives } = options;

  // Error handling
  if (!success && error) {
    return generateErrorResponse(intent, error);
  }

  // Generate response based on intent
  switch (intent) {
    case 'create_event':
      return generateEventResponse(data);
    
    case 'create_task':
      return generateTaskResponse(data);
    
    case 'create_note':
      return generateNoteResponse(data);
    
    case 'create_expense':
      return generateExpenseResponse(data);
    
    case 'read_calendar':
    case 'read_tasks':
    case 'read_notes':
    case 'read_expenses':
      return generateReadResponse(intent, data);
    
    case 'read_summary':
      return generateSummaryResponse(data);
    
    case 'update_wellness':
      return generateWellnessResponse(data);
    
    case 'emotional_support':
      return generateEmotionalResponse(data);
    
    case 'ambiguous':
      return generateAmbiguousResponse(alternatives);
    
    default:
      return "Fatto! 👍";
  }
}

function generateEventResponse(data: any): string {
  const { title, startTime, isAllDay } = data;
  
  if (!startTime) {
    return `Ho creato l'evento "${title}" 📅`;
  }

  const date = new Date(startTime);
  const formattedDate = formatDateForDisplay(date);
  
  if (isAllDay) {
    return `Perfetto! Ti ricordo "${title}" ${formattedDate} (tutto il giorno) 👍`;
  }
  
  const formattedTime = formatTimeForDisplay(date);
  return `Perfetto! Ti ricordo "${title}" ${formattedDate} alle ${formattedTime} 👍`;
}

function generateTaskResponse(data: any): string {
  const { title } = data;
  const responses = [
    `Fatto! Ho aggiunto "${title}" alla tua lista ✔️`,
    `Ok! "${title}" è tra i tuoi task 📋`,
    `Perfetto! "${title}" aggiunto ai compiti ✅`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateNoteResponse(data: any): string {
  const responses = [
    `Ok! Ho salvato la nota 📝`,
    `Nota salvata! 📝`,
    `Fatto! Nota aggiunta ✍️`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateExpenseResponse(data: any): string {
  const { amount, category } = data;
  return `Registrato! Hai speso €${amount.toFixed(2)} per ${category} 💸`;
}

function generateReadResponse(intent: string, data: any): string {
  switch (intent) {
    case 'read_tasks': {
      const tasks = data || [];
      if (tasks.length === 0) {
        return "Nessun task al momento ✨";
      }
      const pending = tasks.filter((t: any) => !t.completed).length;
      const completed = tasks.filter((t: any) => t.completed).length;
      return `Hai ${pending} task da fare e ${completed} completati 📋`;
    }
    
    case 'read_notes': {
      const notes = data || [];
      if (notes.length === 0) {
        return "Nessuna nota salvata 📝";
      }
      return `Hai ${notes.length} note salvate 📝`;
    }
    
    case 'read_expenses': {
      const expenses = data.expenses || [];
      const total = data.total || 0;
      const period = data.period || 'totale';
      return `Hai speso €${total.toFixed(2)} ${period} 💸`;
    }
    
    case 'read_calendar': {
      const events = data || [];
      if (events.length === 0) {
        return "Nessun evento in programma 📅";
      }
      return `Hai ${events.length} ${events.length === 1 ? 'evento' : 'eventi'} in programma 📅`;
    }
    
    default:
      return "Ecco i tuoi dati 📊";
  }
}

function generateSummaryResponse(data: any): string {
  const { tasks = [], expenses = [], events = [], scope = 'oggi' } = data;
  
  const pendingTasks = tasks.filter((t: any) => !t.completed).length;
  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  
  const scopeText = scope === 'today' ? 'oggi' 
    : scope === 'week' ? 'questa settimana' 
    : 'questo mese';
  
  return `Riepilogo ${scopeText}:\n${pendingTasks} task da fare, €${totalExpenses.toFixed(2)} spesi, ${events.length} eventi 📊`;
}

function generateWellnessResponse(data: any): string {
  const updates: string[] = [];
  if (data.sleep) updates.push(`${data.sleep}h sonno`);
  if (data.steps) updates.push(`${data.steps} passi`);
  if (data.meditation) updates.push(`${data.meditation} min meditazione`);
  
  return `Benessere aggiornato: ${updates.join(', ')} 💪`;
}

function generateEmotionalResponse(data: any): string {
  const { sentiment } = data;
  
  const responses: { [key: string]: string[] } = {
    stressed: [
      "Capisco, a volte è davvero pesante. Respira un attimo. Facciamo un passo alla volta 💛",
      "Lo stress è normale, ma sei più forte di quanto pensi. Un passo alla volta 💪",
      "Ti capisco. Prenditi un momento per te. Respira. Ce la puoi fare 🌟"
    ],
    tired: [
      "Il riposo è importante. Ascolta il tuo corpo. Va bene prendersi una pausa 🌙",
      "Sei stanco/a, è comprensibile. Riposa quando puoi. Domani sarà migliore ⭐",
      "La stanchezza è il modo del corpo di dirti di rallentare. Prenditi cura di te 💙"
    ],
    unmotivated: [
      "È normale sentirsi così. Piccoli passi portano a grandi risultati. Avanti così! 🚀",
      "La motivazione va e viene. Tu continua, ce la stai facendo 🌟",
      "Ogni grande cosa inizia con piccoli passi. Non mollare 💪"
    ],
    struggling: [
      "Non sei solo/a. Va bene chiedere aiuto. Un passo alla volta, ce la farai 💚",
      "Le sfide ci rendono più forti. Respira, sei sulla strada giusta 🌈",
      "Capisco che sia difficile. Ma ogni difficoltà è temporanea. Avanti! 💪"
    ],
    default: [
      "Sono qui per aiutarti. Come posso supportarti oggi? 💙",
      "Ti ascolto. Parliamo di come posso aiutarti 🌟",
      "Tutto bene? Come posso esserti utile? 💚"
    ]
  };

  const messageArray = responses[sentiment] || responses.default;
  return messageArray[Math.floor(Math.random() * messageArray.length)];
}

function generateAmbiguousResponse(alternatives?: string[]): string {
  if (!alternatives || alternatives.length === 0) {
    return "Non ho capito bene. Puoi riformulare? 🤔";
  }

  const intentLabels: { [key: string]: string } = {
    create_event: "un evento/appuntamento",
    create_task: "un task/compito",
    create_note: "una nota",
    create_expense: "una spesa",
    read_calendar: "vedere il calendario",
    read_tasks: "vedere i task",
    read_notes: "vedere le note"
  };

  const options = alternatives
    .slice(0, 3)
    .map(alt => intentLabels[alt] || alt)
    .join(', ');

  return `Non sono sicuro. Vuoi creare ${options}? 🤔`;
}

function generateErrorResponse(intent: string, error: string): string {
  const genericErrors = [
    "Ops, qualcosa è andato storto. Riprova 🔄",
    "Errore temporaneo. Riprova tra poco 🔄",
    "Non sono riuscito a completare l'operazione. Riprova 🔄"
  ];

  // Specific error messages
  if (error.includes('date') || error.includes('tempo')) {
    return "Non ho capito bene la data. Puoi specificare quando? (es: domani, lunedì, alle 15) 📅";
  }

  if (error.includes('amount')) {
    return "Non ho capito l'importo. Puoi specificare la cifra? (es: 50€, 12.50 euro) 💰";
  }

  return genericErrors[Math.floor(Math.random() * genericErrors.length)];
}

export function generateClarificationQuestion(intent: string, missingField: string): string {
  const questions: { [key: string]: { [key: string]: string } } = {
    create_event: {
      date: "Quando vuoi questo evento? (es: domani, lunedì pomeriggio, alle 15)",
      time: "A che ora? (es: mattina, 15:00, pomeriggio)",
      title: "Che titolo vuoi dare all'evento?"
    },
    create_task: {
      title: "Cosa devi fare esattamente?",
      due_date: "Entro quando? (opzionale)"
    },
    create_expense: {
      amount: "Quanto hai speso?",
      category: "Per cosa? (es: cibo, trasporti, shopping)"
    }
  };

  return questions[intent]?.[missingField] || "Puoi darmi più dettagli? 🤔";
}
