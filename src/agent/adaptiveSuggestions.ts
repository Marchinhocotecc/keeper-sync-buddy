/**
 * Adaptive Suggestions - Sistema di suggerimenti intelligenti basato sullo storico utente
 */

export interface Suggestion {
  text: string;
  action?: string;
  priority: 'low' | 'medium' | 'high';
}

export interface UserContext {
  recentTasks: Array<{ title: string; completed: boolean; created_at: string }>;
  recentExpenses: Array<{ amount: number; category: string; date: string }>;
  recentEvents: Array<{ title: string; start_time: string }>;
  settings?: { monthly_budget?: number };
}

export function generateAdaptiveSuggestions(context: UserContext): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const now = new Date();
  
  // Analyze task patterns
  if (context.recentTasks.length > 0) {
    const pendingTasks = context.recentTasks.filter(t => !t.completed);
    const completedToday = context.recentTasks.filter(t => {
      const taskDate = new Date(t.created_at);
      return t.completed && taskDate.toDateString() === now.toDateString();
    });
    
    if (pendingTasks.length > 5) {
      suggestions.push({
        text: `Hai ${pendingTasks.length} task in sospeso. Inizia da quello più vecchio?`,
        priority: 'high'
      });
    }
    
    if (completedToday.length > 0) {
      suggestions.push({
        text: `Ben fatto! Hai completato ${completedToday.length} task oggi. Continua così!`,
        priority: 'low'
      });
    }
    
    // Check if user hasn't created tasks recently
    const lastTaskDate = new Date(context.recentTasks[0].created_at);
    const daysSinceLastTask = Math.floor((now.getTime() - lastTaskDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLastTask > 2) {
      suggestions.push({
        text: "Non hai creato task di recente. Vuoi pianificare qualcosa per oggi?",
        priority: 'medium'
      });
    }
  }
  
  // Analyze expense patterns
  if (context.recentExpenses.length > 0) {
    const thisMonthExpenses = context.recentExpenses.filter(e => {
      const expenseDate = new Date(e.date);
      return expenseDate.getMonth() === now.getMonth() && expenseDate.getFullYear() === now.getFullYear();
    });
    
    const totalThisMonth = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    if (context.settings?.monthly_budget) {
      const budget = context.settings.monthly_budget;
      const percentage = (totalThisMonth / budget) * 100;
      
      if (percentage > 80 && percentage < 100) {
        suggestions.push({
          text: `⚠️ Hai speso l'${percentage.toFixed(0)}% del budget mensile. Controlla le spese non necessarie.`,
          priority: 'high'
        });
      } else if (percentage >= 100) {
        suggestions.push({
          text: `🚨 Hai superato il budget mensile di €${(totalThisMonth - budget).toFixed(2)}!`,
          priority: 'high'
        });
      } else if (percentage < 50 && now.getDate() > 20) {
        suggestions.push({
          text: `💰 Ottimo controllo delle spese! Sei sotto il 50% del budget.`,
          priority: 'low'
        });
      }
    }
    
    // Check for duplicate expenses (possible tracking errors)
    const expensesByDay = thisMonthExpenses.reduce((acc, e) => {
      const day = new Date(e.date).toDateString();
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const duplicateDays = Object.entries(expensesByDay).filter(([_, count]) => count > 5);
    if (duplicateDays.length > 0) {
      suggestions.push({
        text: `Hai registrato molte spese in alcuni giorni. Vuoi rivedere le tue spese recenti?`,
        priority: 'medium'
      });
    }
  }
  
  // Analyze calendar patterns
  if (context.recentEvents.length > 0) {
    const todayEvents = context.recentEvents.filter(e => {
      const eventDate = new Date(e.start_time);
      return eventDate.toDateString() === now.toDateString();
    });
    
    const upcomingEvents = context.recentEvents.filter(e => {
      const eventDate = new Date(e.start_time);
      return eventDate > now && eventDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
    });
    
    if (todayEvents.length > 0 && now.getHours() < 9) {
      suggestions.push({
        text: `Hai ${todayEvents.length} event${todayEvents.length > 1 ? 'i' : 'o'} oggi. Rivedi il calendario?`,
        priority: 'medium'
      });
    }
    
    if (upcomingEvents.length > 0) {
      const nextEvent = upcomingEvents[0];
      const hoursUntil = Math.floor((new Date(nextEvent.start_time).getTime() - now.getTime()) / (1000 * 60 * 60));
      
      if (hoursUntil <= 2) {
        suggestions.push({
          text: `📅 "${nextEvent.title}" inizia tra ${hoursUntil} or${hoursUntil > 1 ? 'e' : 'a'}. Sei pronto?`,
          priority: 'high'
        });
      }
    }
  }
  
  // Time-based suggestions
  const hour = now.getHours();
  
  if (hour >= 6 && hour < 9) {
    suggestions.push({
      text: "☀️ Buongiorno! Pianifica la tua giornata per partire con il piede giusto.",
      priority: 'low'
    });
  } else if (hour >= 12 && hour < 14) {
    suggestions.push({
      text: "🍽️ Pausa pranzo? Ricorda di staccare davvero per ricaricarti.",
      priority: 'low'
    });
  } else if (hour >= 17 && hour < 19) {
    suggestions.push({
      text: "🌅 Fine giornata? Rivedi cosa hai fatto e pianifica domani.",
      priority: 'low'
    });
  } else if (hour >= 22) {
    suggestions.push({
      text: "🌙 È tardi. Prepara la giornata di domani e vai a riposare.",
      priority: 'medium'
    });
  }
  
  // Generic motivational suggestions
  if (suggestions.length < 2) {
    suggestions.push({
      text: "💡 Un passo alla volta. Cosa vuoi realizzare oggi?",
      priority: 'low'
    });
  }
  
  // Sort by priority and return top 3
  return suggestions
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    })
    .slice(0, 3);
}

export function shouldShowSuggestions(lastShownTime: number | null): boolean {
  if (!lastShownTime) return true;
  
  const now = Date.now();
  const hoursSinceLastShown = (now - lastShownTime) / (1000 * 60 * 60);
  
  // Show suggestions max once every 3 hours
  return hoursSinceLastShown >= 3;
}
