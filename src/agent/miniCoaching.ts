/**
 * Mini Coaching - Sistema locale di supporto emotivo e coaching
 */

export interface CoachingResponse {
  message: string;
  suggestions?: string[];
  type: 'encouragement' | 'advice' | 'exercise';
}

const COACHING_TEMPLATES = {
  stressed: [
    {
      message: "Capisco che ti senti stressato. Ricorda: una cosa alla volta. Prova a fare tre respiri profondi ora.",
      suggestions: [
        "Fai una pausa di 5 minuti",
        "Scrivi le tue priorità per oggi",
        "Prova una meditazione guidata breve"
      ],
      type: 'advice' as const
    },
    {
      message: "Lo stress è normale, ma gestibile. Concentrati su ciò che puoi controllare adesso.",
      suggestions: [
        "Identifica la causa principale dello stress",
        "Delega o rimanda ciò che non è urgente",
        "Fai una breve camminata"
      ],
      type: 'advice' as const
    }
  ],
  tired: [
    {
      message: "La stanchezza è un segnale del tuo corpo. Ascoltalo. Hai bisogno di riposo.",
      suggestions: [
        "Prenditi una pausa vera",
        "Controlla le tue ore di sonno",
        "Bevi acqua e fai stretching"
      ],
      type: 'advice' as const
    },
    {
      message: "Essere stanchi non significa essere deboli. Riposare è produttivo.",
      suggestions: [
        "Pianifica un riposo di qualità stasera",
        "Riduci gli impegni non essenziali",
        "Chiedi aiuto se ne hai bisogno"
      ],
      type: 'advice' as const
    }
  ],
  unmotivated: [
    {
      message: "La motivazione va e viene, ma la disciplina resta. Inizia con un piccolo passo.",
      suggestions: [
        "Scegli un'attività semplice da completare",
        "Celebra anche i piccoli progressi",
        "Ricorda perché hai iniziato"
      ],
      type: 'encouragement' as const
    },
    {
      message: "Non devi sentirti motivato per iniziare. Inizia e la motivazione arriverà.",
      suggestions: [
        "Dedica solo 10 minuti a un compito",
        "Cambia ambiente di lavoro",
        "Parla con qualcuno di fidato"
      ],
      type: 'encouragement' as const
    }
  ],
  struggling: [
    {
      message: "Lottare è umano. Non sei solo. Ogni problema ha una soluzione, anche se non è subito visibile.",
      suggestions: [
        "Scomponi il problema in parti più piccole",
        "Chiedi supporto a chi può aiutarti",
        "Prenditi tempo per riflettere"
      ],
      type: 'advice' as const
    },
    {
      message: "Le difficoltà sono temporanee. Stai facendo del tuo meglio, e questo conta.",
      suggestions: [
        "Scrivi cosa ti blocca",
        "Prova un approccio diverso",
        "Ricordati dei problemi che hai già risolto"
      ],
      type: 'advice' as const
    }
  ],
  neutral: [
    {
      message: "Sono qui per aiutarti. Come posso supportarti oggi?",
      suggestions: [
        "Organizza la tua giornata",
        "Rivedi i tuoi obiettivi",
        "Prenditi cura del tuo benessere"
      ],
      type: 'advice' as const
    }
  ]
};

const GENERAL_TIPS = [
  "Ricorda di bere acqua regolarmente durante la giornata",
  "Fare pause brevi ogni 60-90 minuti migliora la produttività",
  "Il sonno di qualità è la base di tutto: punta a 7-8 ore",
  "Muoviti almeno 30 minuti al giorno, anche solo una camminata",
  "Celebra i piccoli successi, non solo i grandi traguardi",
  "La gratitudine quotidiana migliora l'umore: prova a elencare 3 cose positive oggi"
];

export function getCoachingResponse(sentiment: string, context: string): CoachingResponse {
  const templates = COACHING_TEMPLATES[sentiment as keyof typeof COACHING_TEMPLATES] || COACHING_TEMPLATES.neutral;
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  
  // Add a general tip occasionally
  if (Math.random() > 0.7) {
    const tip = GENERAL_TIPS[Math.floor(Math.random() * GENERAL_TIPS.length)];
    return {
      ...randomTemplate,
      message: `${randomTemplate.message}\n\n💡 ${tip}`
    };
  }
  
  return randomTemplate;
}

export function getQuickTip(): string {
  return GENERAL_TIPS[Math.floor(Math.random() * GENERAL_TIPS.length)];
}

export function analyzeWellnessPattern(recentData: { sleep?: number; steps?: number; meditation?: number }[]): string {
  if (recentData.length === 0) return "Inizia a tracciare il tuo benessere per ricevere insights personalizzati.";
  
  const avgSleep = recentData.filter(d => d.sleep).reduce((acc, d) => acc + (d.sleep || 0), 0) / recentData.filter(d => d.sleep).length;
  const avgSteps = recentData.filter(d => d.steps).reduce((acc, d) => acc + (d.steps || 0), 0) / recentData.filter(d => d.steps).length;
  
  const insights: string[] = [];
  
  if (avgSleep < 6) {
    insights.push("⚠️ Stai dormendo poco. Il sonno è fondamentale per salute e produttività.");
  } else if (avgSleep >= 7 && avgSleep <= 8) {
    insights.push("✅ Il tuo sonno è ottimale, continua così!");
  }
  
  if (avgSteps < 5000) {
    insights.push("💪 Cerca di muoverti di più: punta a 7000-10000 passi al giorno.");
  } else if (avgSteps >= 8000) {
    insights.push("🎉 Ottimo lavoro con l'attività fisica!");
  }
  
  if (insights.length === 0) {
    return "I tuoi dati di benessere sono nella media. Continua a monitorarli!";
  }
  
  return insights.join("\n");
}
