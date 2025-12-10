/**
 * Local Assistant - Fast on-device logic for simple intents
 */

import { supabase } from '@/integrations/supabase/client';
import * as dataService from '@/services/dataService';

export interface LocalAssistantResponse {
  text: string;
  confidence: number;
  data?: any;
  suggestions?: Array<{ text: string; priority: string }>;
}

// Intent patterns with confidence scores
const INTENT_PATTERNS = {
  greeting: {
    patterns: [/^(ciao|hey|salve|buongiorno|buonasera|ehi)/i],
    confidence: 0.95
  },
  thanks: {
    patterns: [/^(grazie|ok|perfetto|ottimo|bene|fantastico)/i],
    confidence: 0.95
  },
  read_tasks: {
    patterns: [
      /mostra.*task/i,
      /lista.*task/i,
      /i miei task/i,
      /quanti task/i,
      /task.*pending/i,
      /cosa devo fare/i,
    ],
    confidence: 0.9
  },
  read_expenses: {
    patterns: [
      /mostra.*spese/i,
      /le mie spese/i,
      /quanto.*speso/i,
      /spese.*mese/i,
    ],
    confidence: 0.9
  },
  read_calendar: {
    patterns: [
      /mostra.*eventi/i,
      /mostra.*calendario/i,
      /cosa ho in programma/i,
      /eventi.*oggi/i,
      /eventi.*settimana/i,
    ],
    confidence: 0.9
  },
  create_task: {
    patterns: [
      /crea.*task/i,
      /aggiungi.*task/i,
      /nuovo task/i,
      /devo.*fare/i,
      /ricordami di/i,
    ],
    confidence: 0.8
  },
  create_event: {
    patterns: [
      /crea.*evento/i,
      /aggiungi.*evento/i,
      /nuovo evento/i,
      /appuntamento/i,
    ],
    confidence: 0.8
  },
  create_note: {
    patterns: [
      /salva.*nota/i,
      /crea.*nota/i,
      /annota/i,
      /scrivi.*nota/i,
    ],
    confidence: 0.85
  }
};

// Greeting responses
const GREETING_RESPONSES = [
  "Ciao! Come posso aiutarti oggi? 💛",
  "Hey! Sono qui per te. Dimmi pure!",
  "Buongiorno! Cosa possiamo fare insieme oggi?",
  "Ciao! Pronto ad aiutarti con qualsiasi cosa 😊",
];

const THANKS_RESPONSES = [
  "Di nulla! Sono sempre qui per te 💛",
  "Figurati! Se hai bisogno, dimmi pure!",
  "Sempre a disposizione! 😊",
  "Prego! Buona giornata!",
];

function getRandomResponse(responses: string[]): string {
  return responses[Math.floor(Math.random() * responses.length)];
}

function detectIntent(message: string): { type: string; confidence: number } | null {
  const normalizedMessage = message.toLowerCase().trim();
  
  for (const [intentType, config] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(normalizedMessage)) {
        return { type: intentType, confidence: config.confidence };
      }
    }
  }
  
  return null;
}

function extractTaskTitle(message: string): string {
  const cleaners = [
    /^(crea|aggiungi|nuovo)\s+(un\s+)?task\s*/i,
    /^ricordami\s+di\s*/i,
    /^devo\s*/i,
  ];
  
  let title = message;
  for (const cleaner of cleaners) {
    title = title.replace(cleaner, '');
  }
  
  return title.trim() || 'Nuovo task';
}

function extractNoteContent(message: string): string {
  const cleaners = [
    /^(salva|crea|scrivi)\s+(una\s+)?nota\s*:?\s*/i,
    /^annota\s*:?\s*/i,
  ];
  
  let content = message;
  for (const cleaner of cleaners) {
    content = content.replace(cleaner, '');
  }
  
  return content.trim();
}

export async function processLocally(
  message: string, 
  userId: string
): Promise<LocalAssistantResponse> {
  const intent = detectIntent(message);
  
  if (!intent) {
    return {
      text: '',
      confidence: 0
    };
  }
  
  switch (intent.type) {
    case 'greeting':
      return {
        text: getRandomResponse(GREETING_RESPONSES),
        confidence: intent.confidence,
        suggestions: [
          { text: "Mostra i miei task", priority: "medium" },
          { text: "Cosa ho in programma oggi?", priority: "medium" },
          { text: "Come posso organizzarmi meglio?", priority: "low" },
        ]
      };
      
    case 'thanks':
      return {
        text: getRandomResponse(THANKS_RESPONSES),
        confidence: intent.confidence
      };
      
    case 'read_tasks': {
      const result = await dataService.getTasks(userId, 'all');
      const pending = (result.data || []).filter((t: any) => !t.completed);
      
      if (pending.length === 0) {
        return {
          text: "🎉 Non hai task in sospeso! Ottimo lavoro!",
          confidence: intent.confidence,
          data: result.data,
          suggestions: [
            { text: "Crea un nuovo task", priority: "medium" },
            { text: "Mostra il calendario", priority: "low" },
          ]
        };
      }
      
      const taskList = pending.slice(0, 5).map((t: any) => `• ${t.title}`).join('\n');
      const moreText = pending.length > 5 ? `\n\n...e altri ${pending.length - 5}` : '';
      
      return {
        text: `📋 **I tuoi task (${pending.length}):**\n\n${taskList}${moreText}`,
        confidence: intent.confidence,
        data: result.data,
        suggestions: [
          { text: "Segna il primo come completato", priority: "high" },
          { text: "Crea un nuovo task", priority: "medium" },
        ]
      };
    }
    
    case 'read_expenses': {
      const result = await dataService.getExpenses(userId, 'month');
      const total = (result.data || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      
      return {
        text: `💰 **Spese di questo mese:** €${total.toFixed(2)}\n\nContinua così! 💪`,
        confidence: intent.confidence,
        data: result.data
      };
    }
    
    case 'read_calendar': {
      const result = await dataService.getEvents(userId, 'week');
      const events = result.data || [];
      
      if (events.length === 0) {
        return {
          text: "📅 Nessun evento in programma questa settimana!",
          confidence: intent.confidence,
          data: events,
          suggestions: [
            { text: "Aggiungi un nuovo evento", priority: "medium" },
          ]
        };
      }
      
      const eventList = events.slice(0, 5).map((e: any) => {
        const date = new Date(e.start_time);
        return `• ${e.title} - ${date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}`;
      }).join('\n');
      
      return {
        text: `📅 **Prossimi eventi:**\n\n${eventList}`,
        confidence: intent.confidence,
        data: events
      };
    }
    
    case 'create_task': {
      const title = extractTaskTitle(message);
      const result = await dataService.createTask(userId, title, 'medium');
      
      if (result.success) {
        return {
          text: `✅ Task creato: "${title}"\n\nForza, ce la fai! 💪`,
          confidence: intent.confidence,
          data: result.data,
          suggestions: [
            { text: "Mostra i miei task", priority: "medium" },
            { text: "Crea un altro task", priority: "low" },
          ]
        };
      }
      
      return {
        text: "❌ Non sono riuscito a creare il task. Riprova!",
        confidence: 0.5
      };
    }
    
    case 'create_note': {
      const content = extractNoteContent(message);
      
      if (!content) {
        return {
          text: "📝 Cosa vorresti annotare?",
          confidence: 0.6
        };
      }
      
      const result = await dataService.createNote(userId, content);
      
      if (result.success) {
        return {
          text: `📝 Nota salvata!\n\n"${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
          confidence: intent.confidence,
          data: result.data
        };
      }
      
      return {
        text: "❌ Non sono riuscito a salvare la nota. Riprova!",
        confidence: 0.5
      };
    }
    
    default:
      return {
        text: '',
        confidence: 0
      };
  }
}
