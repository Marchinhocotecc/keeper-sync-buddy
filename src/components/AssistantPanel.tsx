import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Zap, User, Lightbulb, Trash2, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { generateFinancialSignals } from "@/services/financialSignals";
import { loadFinancialProfile } from "@/services/financialState";
import { evaluateRisk } from "@/services/riskEngine";
import { getLatestWeeklySummary } from "@/services/weeklySummaryService";
import { getLatestMonthlySummary } from "@/services/monthlySummaryService";
import { getActiveStrategy } from "@/services/actionTracker";
import { useExpenseReaction } from "@/hooks/useExpenseReaction";

interface FinancialAction {
  type: string;
  title: string;
  description: string;
}

interface StructuredResponse {
  summary: string;
  reasoning: string;
  actions: FinancialAction[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: string[];
  structured?: StructuredResponse;
}

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
};

function detectIntentType(message: string): string {
  const lower = message.toLowerCase();
  if (/posso permettermi|posso spendere|quanto posso/.test(lower)) return "spending_check";
  if (/come sto|sto andando|situazione/.test(lower)) return "performance_check";
  if (/pianifica|prossim|futuro|obiettivo/.test(lower)) return "planning";
  return "analysis";
}

function StructuredResponseView({ structured }: { structured: StructuredResponse }) {
  const { t } = useTranslation();
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{structured.summary}</p>
      
      {structured.reasoning && (
        <div>
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {t('assistant.reasoning')}
          </button>
          {showReasoning && (
            <p className="text-xs text-muted-foreground mt-1 pl-4 border-l-2 border-border">
              {structured.reasoning}
            </p>
          )}
        </div>
      )}

      {structured.actions && structured.actions.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {structured.actions.slice(0, 3).map((action, i) => (
            <div
              key={i}
              className="flex items-start gap-2 bg-primary/5 border border-primary/10 rounded-lg p-2"
            >
              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                {action.type === "create_task" ? "📝" : action.type === "adjust_budget" ? "💰" : "🔍"}
              </Badge>
              <div>
                <p className="text-xs font-medium text-foreground">{action.title}</p>
                {action.description && (
                  <p className="text-[10px] text-muted-foreground">{action.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssistantPanel() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; priority: string }>>([]);
  
  const { reactToExpense } = useExpenseReaction();
  const lastCallRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isRequestingRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, isLoading]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId && messages.length === 0) {
      setSuggestions([
        { text: t('assistant.suggestion_focus'), priority: "high" },
        { text: t('assistant.suggestion_tasks'), priority: "medium" },
        { text: t('assistant.suggestion_events'), priority: "medium" },
        { text: t('assistant.suggestion_expenses'), priority: "low" },
      ]);
    }
  }, [userId, messages.length, i18n.language]);

  const UI_ACTION_MAP: Record<string, string> = {
    [t('assistant.suggestion_tasks')]: "__UI_ACTION__:SHOW_TASKS",
    [t('assistant.suggestion_events')]: "__UI_ACTION__:SHOW_EVENTS",
    [t('assistant.suggestion_expenses')]: "__UI_ACTION__:SHOW_EXPENSES",
    "Mostra task": "__UI_ACTION__:SHOW_TASKS",
    "Mostra eventi": "__UI_ACTION__:SHOW_EVENTS",
    "Mostra spese": "__UI_ACTION__:SHOW_EXPENSES",
    "Show tasks": "__UI_ACTION__:SHOW_TASKS",
    "Show events": "__UI_ACTION__:SHOW_EVENTS",
    "Show expenses": "__UI_ACTION__:SHOW_EXPENSES",
    "Aggiungi task": "__UI_ACTION__:ADD_TASK",
    "Aggiungi evento": "__UI_ACTION__:CREATE_EVENT",
    "Add task": "__UI_ACTION__:ADD_TASK",
    "Add event": "__UI_ACTION__:CREATE_EVENT",
    "Elimina tutti": "__UI_ACTION__:DELETE_ALL",
    "Delete all": "__UI_ACTION__:DELETE_ALL",
    "Completa tutte": "__UI_ACTION__:COMPLETE_ALL_TASKS",
    "Complete all": "__UI_ACTION__:COMPLETE_ALL_TASKS",
  };

  const handleClearHistory = async () => {
    if (!userId) return;
    
    try {
      setMessages([]);
      
      await supabase
        .from('assistant_state')
        .upsert({
          user_id: userId,
          active_intent: 'NONE',
          intent_payload: {},
          missing_fields: [],
          awaiting_confirmation: false,
          attempts: 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      toast({
        title: t('assistant.history_cleared'),
        description: t('assistant.history_cleared_desc'),
      });
    } catch (error) {
      toast({
        title: t('assistant.error'),
        description: t('assistant.error_clear'),
        variant: "destructive",
      });
    }
  };

  const buildFinancialContext = async (userMessage: string) => {
    if (!userId) return undefined;
    try {
      const [signals, profile, lastWeekly, lastMonthly] = await Promise.all([
        generateFinancialSignals(userId),
        loadFinancialProfile(userId),
        getLatestWeeklySummary(userId),
        getLatestMonthlySummary(userId),
      ]);
      if (!signals) return undefined;

      const risk = evaluateRisk(signals, profile);
      return {
        signals: {
          burnRate: signals.burnRate,
          projectedEndBalance: signals.projectedEndBalance,
          dailySafeLimit: signals.dailySafeLimit,
          daysRemaining: signals.daysRemaining,
          topCategory: signals.topCategory,
          impulseCount: signals.impulseCount,
          totalSpent: signals.totalSpent,
          budget: signals.budget,
          timeProgress: signals.timeProgress,
        },
        risk: { riskLevel: risk.riskLevel, flags: risk.flags },
        timeframe: "month" as const,
        userIntentType: detectIntentType(userMessage),
        lastWeeklySummary: lastWeekly,
        lastMonthlySummary: lastMonthly,
      };
    } catch {
      return undefined;
    }
  };

  const sendMessage = useCallback(async (messageText?: string) => {
    const rawText = messageText || input.trim();
    if (!rawText || isLoading || !userId) return;
    
    const textToSend = UI_ACTION_MAP[rawText] || rawText;

    if (isRequestingRef.current) return;

    const now = Date.now();
    if (now - lastCallRef.current < 1000) {
      toast({
        title: t('assistant.wait'),
        description: t('assistant.wait_desc'),
        variant: "default",
      });
      return;
    }
    lastCallRef.current = now;
    isRequestingRef.current = true;

    const userMessage: Message = { 
      role: "user", 
      content: rawText,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setSuggestions([]);

    try {
      // Build financial context in parallel with nothing blocking
      const [financialContext, activeStrategy] = await Promise.all([
        buildFinancialContext(rawText),
        userId ? getActiveStrategy(userId) : Promise.resolve(null),
      ]);

      // Inject active strategy into financial context
      if (financialContext && activeStrategy) {
        (financialContext as any).activeStrategy = activeStrategy;
      }

      const { data, error } = await supabase.functions.invoke("ai-free-chat", {
        body: {
          userMessage: textToSend,
          userId,
          locale: i18n.language,
          financialContext,
        }
      });
      
      if (error) {
        console.error("[AssistantPanel] Edge function error:", error);
        
        const fallbackMessage: Message = {
          role: "assistant",
          content: t('assistant.connection_issue'),
          timestamp: new Date(),
          suggestions: [t('assistant.retry'), t('assistant.suggestion_tasks'), t('assistant.suggestion_events')]
        };
        setMessages((prev) => [...prev, fallbackMessage]);
        setSuggestions([
          { text: t('assistant.retry'), priority: "high" },
          { text: t('assistant.suggestion_tasks'), priority: "medium" },
          { text: t('assistant.suggestion_events'), priority: "medium" },
        ]);
        return;
      }
      
      // Check for structured financial response
      const structured = data.structured as StructuredResponse | undefined;

      const assistantMessage: Message = {
        role: "assistant",
        content: structured ? structured.summary : (data.reply || t('assistant.how_can_i_help')),
        timestamp: new Date(),
        suggestions: data.suggestions,
        structured,
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.map((s: string) => ({ text: s, priority: 'medium' })));
      }
    } catch (error: any) {
      console.error("[AssistantPanel] Unexpected error:", error);
      
      const fallbackMessage: Message = {
        role: "assistant",
        content: t('assistant.something_wrong'),
        timestamp: new Date(),
        suggestions: [t('assistant.suggestion_tasks'), t('assistant.suggestion_events'), t('assistant.quick_new_task')]
      };
      setMessages((prev) => [...prev, fallbackMessage]);
      setSuggestions([
        { text: t('assistant.suggestion_tasks'), priority: "high" },
        { text: t('assistant.suggestion_events'), priority: "medium" },
        { text: t('assistant.quick_new_task'), priority: "medium" },
      ]);
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [input, isLoading, userId, toast, t, i18n.language]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => sendMessage(), 200);
    }
  }, [isLoading, sendMessage]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const messageVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } }
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] bg-card border-border rounded-xl">
      {messages.length > 0 && (
        <div className="flex justify-end px-4 pt-3 border-b border-border pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearHistory}
            className="text-muted-foreground hover:text-destructive h-7 px-2 rounded-md"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">{t('assistant.clear')}</span>
          </Button>
        </div>
      )}
      
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 && !isLoading && (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-medium mb-1.5 text-foreground">{t('assistant.welcome_title')}</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                  {t('assistant.welcome_subtitle')}
                </p>
                
                {suggestions.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <Lightbulb className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">{t('assistant.try_asking')}</span>
                    </div>
                    {suggestions.map((sug, idx) => (
                      <motion.button
                        key={idx}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        onClick={() => sendMessage(sug.text)}
                        disabled={isLoading}
                        className="block w-full max-w-sm mx-auto text-left p-3 rounded-lg bg-muted/50 hover:bg-muted border border-border transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground">{sug.text}</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {messages.map((msg, idx) => (
              <motion.div 
                key={idx}
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                className="space-y-1"
              >
                <div className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                      <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2.5 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted border border-border"
                  }`}>
                    {msg.role === "assistant" && msg.structured ? (
                      <StructuredResponseView structured={msg.structured} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className={`text-[10px] text-muted-foreground ${msg.role === "user" ? "text-right pr-10" : "pl-10"}`}>
                  {formatTime(msg.timestamp)}
                </div>
                
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="pl-10 mt-2 flex flex-wrap gap-1.5">
                    {msg.suggestions.map((sug, sugIdx) => (
                      <Button
                        key={sugIdx}
                        variant="outline"
                        size="sm"
                        onClick={() => sendMessage(sug)}
                        disabled={isLoading}
                        className="text-xs h-7 rounded-md px-2.5 border-border"
                      >
                        {sug}
                      </Button>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 justify-start">
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Zap className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="bg-muted border border-border rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={scrollRef} />
        </div>
      </div>
      
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-border flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => sendMessage(t('assistant.suggestion_tasks'))} disabled={isLoading} className="text-xs h-7 rounded-md">
            📋 {t('assistant.quick_tasks')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => sendMessage(t('assistant.suggestion_events'))} disabled={isLoading} className="text-xs h-7 rounded-md">
            📅 {t('assistant.quick_events')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => sendMessage(t('assistant.quick_new_task'))} disabled={isLoading} className="text-xs h-7 rounded-md">
            ➕ {t('assistant.quick_add_task')}
          </Button>
        </div>
      )}

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t('assistant.placeholder')}
            disabled={isLoading || !userId}
            className="flex-1 h-10 rounded-lg bg-muted border-border text-sm"
          />
          <Button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim() || !userId}
            size="icon"
            className="h-10 w-10 rounded-lg shrink-0"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
