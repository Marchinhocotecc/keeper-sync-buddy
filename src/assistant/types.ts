/**
 * Types for the Internal Assistant Engine
 */

// Output types for the rules engine
export type InsightType = 'insight' | 'reminder' | 'alert' | 'suggestion';

export interface EngineOutput {
  type: InsightType;
  title: string;
  message: string;
  relevance: number; // 0-1, higher = more relevant
  category?: string;
  actionable?: boolean;
  suggestedAction?: {
    type: string;
    payload: Record<string, any>;
  };
}

// User context and preferences
export interface UserContext {
  userId: string;
  preferences: UserPreferences;
  routines: UserRoutine[];
  goals: UserGoal[];
  lastUpdated: string;
}

export interface UserPreferences {
  workingHours?: { start: string; end: string };
  preferredTaskTime?: 'morning' | 'afternoon' | 'evening';
  budgetAlertThreshold?: number; // percentage 0-100
  reminderFrequency?: 'low' | 'medium' | 'high';
  language?: string;
}

export interface UserRoutine {
  id: string;
  name: string;
  dayOfWeek: number[]; // 0-6, Sunday = 0
  timeSlot: { start: string; end: string };
  category: string;
}

export interface UserGoal {
  id: string;
  title: string;
  category: string;
  targetDate?: string;
  progress: number; // 0-100
  isActive: boolean;
}

// Conversation memory
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: string;
  entities?: Record<string, any>;
}

export interface ConversationSession {
  id: string;
  userId: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

// Habit patterns
export interface HabitPattern {
  type: 'productivity' | 'spending' | 'wellness' | 'scheduling';
  description: string;
  dayOfWeek?: number[];
  timeOfDay?: string;
  frequency: number; // occurrences
  confidence: number; // 0-1
}

export interface ProductivityPattern {
  mostProductiveDays: number[];
  mostProductiveHours: number[];
  averageTasksPerDay: number;
  completionRate: number;
}

export interface SpendingPattern {
  highSpendingDays: number[];
  topCategories: { category: string; amount: number; percentage: number }[];
  weeklyAverage: number;
  monthlyTrend: 'increasing' | 'decreasing' | 'stable';
}

// Time slot for scheduling
export interface TimeSlot {
  start: string;
  end: string;
  duration: number; // minutes
  type: 'free' | 'busy' | 'suggested';
  quality: number; // 0-1, based on productivity patterns
}

// Daily analysis results
export interface DailyAnalysis {
  date: string;
  pendingTasks: number;
  completedTasks: number;
  upcomingEvents: number;
  freeTimeSlots: TimeSlot[];
  budgetStatus: {
    spent: number;
    budget: number;
    percentage: number;
    trend: 'under' | 'on_track' | 'over';
  };
  insights: EngineOutput[];
  suggestions: EngineOutput[];
}

// Briefing types
export interface MorningBriefing {
  greeting: string;
  date: string;
  weather?: string;
  tasksToday: number;
  eventsToday: number;
  topPriorities: string[];
  suggestions: EngineOutput[];
  motivationalNote?: string;
}

export interface EveningReview {
  summary: string;
  tasksCompleted: number;
  tasksRemaining: number;
  highlights: string[];
  tomorrowPreview: string[];
  insights: EngineOutput[];
}

// Intent classification for orchestrator
export type UserIntent = 
  | 'greeting'
  | 'farewell'
  | 'thanks'
  | 'query_tasks'
  | 'query_events'
  | 'query_expenses'
  | 'query_budget'
  | 'query_wellness'
  | 'create_task'
  | 'create_event'
  | 'create_expense'
  | 'update_task'
  | 'update_event'
  | 'get_suggestions'
  | 'get_insights'
  | 'small_talk'
  | 'help'
  | 'unknown';

export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  entities: Record<string, any>;
  requiresExternalAI: boolean;
}

// Orchestrator response
export interface OrchestratorResponse {
  message: string;
  suggestions?: string[];
  action?: {
    type: string;
    payload: Record<string, any>;
  };
  followUp?: string;
  source: 'local' | 'rules' | 'context' | 'focus';
  // Daily Focus specific fields
  decision?: string;
  reasoning?: string;
  focusItems?: FocusItem[];
}

// Daily Focus types
export interface FocusItem {
  type: 'task' | 'event' | 'recovery' | 'wellness';
  id: string | null;
  title: string;
  reason: string;
  confidence: 'high' | 'medium';
  priority: number;
  estimatedMinutes?: number;
  action?: {
    type: 'complete' | 'skip' | 'reschedule';
    payload?: Record<string, any>;
  };
}
