import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Sparkles, Trash2, ArrowUp, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { generateFinancialSignals } from '@/services/financialSignals';
import { loadFinancialProfile } from '@/services/financialState';
import { evaluateRisk } from '@/services/riskEngine';
import { getLatestWeeklySummary } from '@/services/weeklySummaryService';
import { getLatestMonthlySummary } from '@/services/monthlySummaryService';
import { getActiveStrategy } from '@/services/actionTracker';
import { useExpenseReaction } from '@/hooks/useExpenseReaction';
import { hapticImpact } from '@/utils/haptics';
import { cn } from '@/lib/utils';

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
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
  structured?: StructuredResponse;
}

const formatTime = (date: Date, locale: string): string =>
  date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

function StructuredResponseView({ structured }: { structured: StructuredResponse }) {
  const { t } = useTranslation();
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{structured.summary}</p>

      {structured.reasoning && (
        <div>
          <button
            onClick={() => setShowReasoning(!showReasoning)}
            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {t('assistant.reasoning')}
          </button>
          {showReasoning && (
            <p className="text-[12px] text-muted-foreground mt-1 pl-3 border-l-2 border-border">
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
              className="flex items-start gap-2 bg-primary/5 border border-primary/15 rounded-xl p-2.5"
            >
              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5 bg-card">
                {action.type === 'create_task' ? '📝' : action.type === 'adjust_budget' ? '💰' : '🔍'}
              </Badge>
              <div>
                <p className="text-[13px] font-semibold text-foreground">{action.title}</p>
                {action.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{action.description}</p>
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; priority: string }>>([]);

  const { reactToExpense } = useExpenseReaction();
  const lastCallRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRequestingRef = useRef(false);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, isLoading]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [input]);

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
        { text: t('assistant.suggestion_focus'), priority: 'high' },
        { text: t('assistant.suggestion_tasks'), priority: 'medium' },
        { text: t('assistant.suggestion_events'), priority: 'medium' },
        { text: t('assistant.suggestion_expenses'), priority: 'low' },
      ]);
    }
  }, [userId, messages.length, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const UI_ACTION_MAP: Record<string, string> = {
    [t('assistant.suggestion_tasks')]: '__UI_ACTION__:SHOW_TASKS',
    [t('assistant.suggestion_events')]: '__UI_ACTION__:SHOW_EVENTS',
    [t('assistant.suggestion_expenses')]: '__UI_ACTION__:SHOW_EXPENSES',
    [t('assistant.quick_new_task')]: '__UI_ACTION__:ADD_TASK',
    [t('assistant.quick_add_task')]: '__UI_ACTION__:ADD_TASK',
  };

  const handleClearHistory = async () => {
    if (!userId) return;
    hapticImpact('medium');
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
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      toast({ title: t('assistant.history_cleared'), description: t('assistant.history_cleared_desc') });
    } catch {
      toast({ title: t('assistant.error'), description: t('assistant.error_clear'), variant: 'destructive' });
    }
  };

  const buildFinancialContext = async () => {
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
        timeframe: 'month' as const,
        userIntentType: 'analysis',
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
      toast({ title: t('assistant.wait'), description: t('assistant.wait_desc') });
      return;
    }
    lastCallRef.current = now;
    isRequestingRef.current = true;
    hapticImpact('light');

    const userMessage: Message = { role: 'user', content: rawText, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setSuggestions([]);

    try {
      const [financialContext, activeStrategy] = await Promise.all([
        buildFinancialContext(),
        userId ? getActiveStrategy(userId) : Promise.resolve(null),
      ]);
      if (financialContext && activeStrategy) (financialContext as any).activeStrategy = activeStrategy;

      const { data, error } = await supabase.functions.invoke('ai-free-chat', {
        body: { userMessage: textToSend, userId, locale: i18n.language, financialContext },
      });

      if (error) {
        if (import.meta.env.DEV) console.error('[AssistantPanel] Edge function error:', error);
        const fallbackMessage: Message = {
          role: 'assistant',
          content: t('assistant.connection_issue'),
          timestamp: new Date(),
          suggestions: [t('assistant.retry'), t('assistant.suggestion_tasks'), t('assistant.suggestion_events')],
        };
        setMessages((prev) => [...prev, fallbackMessage]);
        setSuggestions([
          { text: t('assistant.retry'), priority: 'high' },
          { text: t('assistant.suggestion_tasks'), priority: 'medium' },
          { text: t('assistant.suggestion_events'), priority: 'medium' },
        ]);
        return;
      }

      const structured = data.structured as StructuredResponse | undefined;
      const assistantMessage: Message = {
        role: 'assistant',
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
      if (import.meta.env.DEV) console.error('[AssistantPanel] Unexpected error:', error);
      const fallbackMessage: Message = {
        role: 'assistant',
        content: t('assistant.something_wrong'),
        timestamp: new Date(),
        suggestions: [t('assistant.suggestion_tasks'), t('assistant.suggestion_events'), t('assistant.quick_new_task')],
      };
      setMessages((prev) => [...prev, fallbackMessage]);
      setSuggestions([
        { text: t('assistant.suggestion_tasks'), priority: 'high' },
        { text: t('assistant.suggestion_events'), priority: 'medium' },
        { text: t('assistant.quick_new_task'), priority: 'medium' },
      ]);
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [input, isLoading, userId, toast, t, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
      e.preventDefault();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => sendMessage(), 200);
    }
  }, [isLoading, sendMessage]);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  // Group consecutive same-author messages (for tighter spacing like iMessage)
  const messageVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] as any } },
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
        <div className="max-w-2xl mx-auto space-y-3">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 && !isLoading && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center text-center pt-6 pb-2"
              >
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-[0_8px_24px_rgba(15,61,62,0.25)] mb-4">
                  <Sparkles className="h-6 w-6 text-primary-foreground" />
                </div>
                <h2 className="text-[19px] font-semibold tracking-tight mb-1.5">
                  {t('assistant.title')}
                </h2>
                <p className="text-[14px] text-muted-foreground max-w-xs leading-relaxed">
                  {t('assistant.welcome_subtitle')}
                </p>
              </motion.div>
            )}

            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const isGrouped = prev && prev.role === msg.role;
              return (
                <motion.div
                  key={idx}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  layout
                  className={cn('space-y-1', isGrouped ? 'pt-0.5' : 'pt-2')}
                >
                  <div className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[82%] sm:max-w-[70%]',
                      msg.role === 'user' ? 'bubble-user' : 'bubble-ai'
                    )}>
                      {msg.role === 'assistant' && msg.structured ? (
                        <StructuredResponseView structured={msg.structured} />
                      ) : (
                        <p className="text-[15px] whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                  </div>
                  {!isGrouped && (
                    <div className={cn(
                      'text-[10px] text-muted-foreground/70 px-1',
                      msg.role === 'user' ? 'text-right' : 'text-left'
                    )}>
                      {formatTime(msg.timestamp, i18n.language)}
                    </div>
                  )}

                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.suggestions.map((sug, sugIdx) => (
                        <button
                          key={sugIdx}
                          onClick={() => sendMessage(sug)}
                          disabled={isLoading}
                          className="text-[12px] h-7 rounded-full px-3 border border-border bg-card hover:bg-muted/80 transition-colors pressable"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start pt-2">
              <div className="bubble-ai">
                <div className="flex gap-1 py-0.5">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Suggestions horizontal scroll */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="px-4 pb-2">
          <div className="max-w-2xl mx-auto scroll-snap-x">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => sendMessage(sug.text)}
                disabled={isLoading}
                className="text-[13px] h-9 rounded-full px-4 border border-border bg-card hover:bg-muted/80 transition-colors pressable whitespace-nowrap"
              >
                {sug.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer (sticky bottom) */}
      <div className="bg-glass border-t border-border/60 px-3 pt-2.5 pb-3 sm:rounded-b-2xl">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearHistory}
              className="h-11 w-11 rounded-full shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={t('assistant.clear')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1 flex items-end gap-1.5 bg-muted/70 rounded-3xl px-4 py-2 min-h-[44px] focus-within:bg-card focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t('assistant.placeholder')}
              disabled={isLoading || !userId}
              rows={1}
              className="flex-1 bg-transparent border-0 outline-none resize-none text-[15px] leading-snug placeholder:text-muted-foreground/70 disabled:opacity-50 max-h-[120px] py-1.5"
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim() || !userId}
            aria-label={t('assistant.send', { defaultValue: 'Invia' })}
            className={cn(
              'h-11 w-11 rounded-full flex items-center justify-center shrink-0 transition-all pressable',
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(15,61,62,0.3)]'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
