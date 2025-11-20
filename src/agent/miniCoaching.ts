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
      message: "Capisco. Respira un attimo. Facciamo un passo alla volta, ci sono 💛",
      suggestions: [
        "Mostrami i task urgenti",
        "Aiutami a prioritizzare"
      ],
      type: 'advice' as const
    }
  ],
  tired: [
    {
      message: "Ti capisco. Prenditi una pausa, ne hai bisogno",
      suggestions: [
        "Registra ore di sonno",
        "Mostra il mio benessere"
      ],
      type: 'advice' as const
    }
  ],
  unmotivated: [
    {
      message: "Lo so, capita. Inizia da una cosa piccola, vedrai che aiuta",
      suggestions: [
        "Mostra task più semplici",
        "Vedi i miei progressi"
      ],
      type: 'encouragement' as const
    }
  ],
  struggling: [
    {
      message: "È normale sentirsi così. Dividi in pezzi piccoli, vai un passo alla volta",
      suggestions: [
        "Mostra cosa ho completato oggi",
        "Aiutami a organizzarmi"
      ],
      type: 'advice' as const
    }
  ],
  neutral: [
    {
      message: "Ti capisco. Sono qui per aiutarti. Dimmi cosa serve",
      suggestions: [
        "Mostra la mia giornata",
        "Aiutami a organizzarmi"
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
  return templates[0];
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
