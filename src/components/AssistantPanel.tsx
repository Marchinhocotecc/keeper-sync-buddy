import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles, Lightbulb, Trash2, Target, Brain, CheckCircle2, SkipForward } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { processMessage, getSmartGreeting, resetConversation } from "@/assistant/aiEngine";
import { loadMemory, clearMemory } from "@/utils/assistant/memory";
import { motion, AnimatePresence } from "framer-motion";
import type { FocusItem } from "@/assistant/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: 'local' | 'external' | 'fallback' | 'focus';
  suggestions?: Array<{ text: string; priority: string }>;
  timestamp: Date;
  commandExecuted?: boolean;
  commandResult?: string;
  // Daily Focus fields
  decision?: string;
  reasoning?: string;
  focusItems?: FocusItem[];
}

// Format timestamp
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('it-IT', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

export default function AssistantPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; priority: string }>>([]);
  
  const lastCallRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isRequestingRef = useRef(false);

  // Autoscroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, isLoading]);

  // Load user session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load memory and suggestions on mount
  useEffect(() => {
    if (userId && messages.length === 0) {
      loadInitialData();
    }
  }, [userId]);

  const loadInitialData = async () => {
    if (!userId) return;
    
    try {
      // Load conversation memory
      const memory = await loadMemory(userId);
      if (memory.length > 0) {
        const loadedMessages: Message[] = memory.map(m => ({
          role: m.role,
          content: m.content,
          source: m.source,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(loadedMessages);
      }
      
      // Set default suggestions with focus-related prompts
      // NOTE: These use display text only - quick actions with special behavior
      // should use the UI_ACTION_MAP in sendMessage()
      setSuggestions([
        { text: "Cosa dovrei fare oggi?", priority: "high" },
        { text: "Da dove inizio?", priority: "medium" },
        { text: "Ho poco tempo, aiutami", priority: "medium" },
        { text: "Mi sento confuso", priority: "low" },
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  /**
   * UI_ACTION_MAP: Maps UI button labels to structured action payloads.
   * These payloads bypass NLP parsing and execute actions directly.
   * Format: __UI_ACTION__:<ACTION_TYPE>
   */
  const UI_ACTION_MAP: Record<string, string> = {
    // Show actions
    "Mostra task": "__UI_ACTION__:SHOW_TASKS",
    "Mostra eventi": "__UI_ACTION__:SHOW_EVENTS",
    "Mostra spese": "__UI_ACTION__:SHOW_EXPENSES",
    "Le mie task": "__UI_ACTION__:SHOW_TASKS",
    "I miei eventi": "__UI_ACTION__:SHOW_EVENTS",
    "Le mie spese": "__UI_ACTION__:SHOW_EXPENSES",
    // Create actions
    "Aggiungi task": "__UI_ACTION__:ADD_TASK",
    "Aggiungi evento": "__UI_ACTION__:CREATE_EVENT",
    // Delete all actions
    "Elimina tutti": "__UI_ACTION__:DELETE_ALL",
    "Elimina tutte": "__UI_ACTION__:DELETE_ALL",
    "Cancella tutti": "__UI_ACTION__:DELETE_ALL",
    "Cancella tutte": "__UI_ACTION__:DELETE_ALL",
    // Complete all actions
    "Completa tutte": "__UI_ACTION__:COMPLETE_ALL_TASKS",
    "Completa tutti": "__UI_ACTION__:COMPLETE_ALL_TASKS",
    // Singular actions (from suggestions after showing lists)
    "Completa uno": "__UI_ACTION__:COMPLETE_ONE",
    "Elimina uno": "__UI_ACTION__:DELETE_ONE",
    "Elimina una": "__UI_ACTION__:DELETE_ONE",
  };

  const handleClearHistory = async () => {
    if (!userId) return;
    
    try {
      await clearMemory(userId);
      setMessages([]);
      toast({
        title: "Cronologia cancellata",
        description: "La memoria dell'assistente è stata resettata.",
      });
    } catch (error) {
      toast({
        title: "Errore",
        description: "Non sono riuscito a cancellare la cronologia.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = useCallback(async (messageText?: string) => {
    const rawText = messageText || input.trim();
    if (!rawText || isLoading || !userId) return;
    
    // Map UI quick action labels to structured payloads (bypass NLP)
    const textToSend = UI_ACTION_MAP[rawText] || rawText;

    // Prevent parallel requests
    if (isRequestingRef.current) {
      return;
    }

    // Prevent spam
    const now = Date.now();
    if (now - lastCallRef.current < 1000) {
      toast({
        title: "Attendi",
        description: "Per favore attendi prima di inviare un altro messaggio",
        variant: "default",
      });
      return;
    }
    lastCallRef.current = now;
    isRequestingRef.current = true;

    // Show user the original label (not the technical payload)
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
      // Use the new hybrid AI Engine
      const response = await processMessage(userId, textToSend);
      
      const assistantMessage: Message = {
        role: "assistant",
        content: response.message,
        source: response.source as Message['source'],
        suggestions: response.suggestions?.map(s => ({ text: s, priority: 'medium' })),
        timestamp: new Date(),
        commandExecuted: response.actionExecuted,
        commandResult: response.actionResult?.success ? 'success' : undefined,
        // Focus-specific fields from orchestrator
        decision: (response as any).decision,
        reasoning: (response as any).reasoning,
        focusItems: (response as any).focusItems
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      // Show suggestions if available
      if (response.suggestions && response.suggestions.length > 0) {
        setSuggestions(response.suggestions.map(s => ({ text: s, priority: 'medium' })));
      }
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Errore nell'elaborazione del messaggio",
        variant: "destructive",
      });
      
      // Remove failed user message
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [input, isLoading, userId, toast]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      
      // Debounce keyboard input
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      debounceTimerRef.current = setTimeout(() => {
        sendMessage();
      }, 300);
    }
  }, [isLoading, sendMessage]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const messageVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.3, ease: "easeOut" as const }
    }
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] bg-background border-border">
      {/* Header with clear button */}
      {messages.length > 0 && (
        <div className="flex justify-end px-4 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearHistory}
            className="text-muted-foreground hover:text-destructive h-8 px-2"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            <span className="text-xs">Cancella</span>
          </Button>
        </div>
      )}
      
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6"
      >
        <div className="space-y-4 sm:space-y-6">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 && !isLoading && (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8 sm:py-12"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Il tuo Coach Personale 💛</h3>
                <p className="text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto text-sm sm:text-base px-4">
                  Ciao! Sono qui per aiutarti a organizzarti e motivarti. Dimmi pure!
                </p>
                
                {suggestions.length > 0 && (
                  <div className="mt-6 sm:mt-8 space-y-2 sm:space-y-3 px-2">
                    <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Suggerimenti per te</span>
                    </div>
                    {suggestions.map((sug, idx) => (
                      <motion.button
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        onClick={() => sendMessage(sug.text)}
                        disabled={isLoading}
                        className="block w-full max-w-md mx-auto text-left p-3 sm:p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-start gap-2 sm:gap-3">
                          <Badge variant={sug.priority === 'high' ? 'destructive' : sug.priority === 'medium' ? 'default' : 'secondary'} className="mt-0.5 text-xs">
                            {sug.priority}
                          </Badge>
                          <span className="text-xs sm:text-sm text-foreground flex-1">{sug.text}</span>
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
                <div
                  className={`flex gap-2 sm:gap-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3 sm:p-4 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-card border border-border shadow-sm"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    
                    {/* Focus Decision Block */}
                    {msg.role === "assistant" && msg.decision && (
                      <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="h-4 w-4 text-primary" />
                          <span className="text-xs font-semibold text-primary uppercase tracking-wide">Decisione</span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{msg.decision}</p>
                      </div>
                    )}
                    
                    {/* Focus Reasoning Block */}
                    {msg.role === "assistant" && msg.reasoning && (
                      <div className="mt-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <Brain className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Perché</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{msg.reasoning}</p>
                      </div>
                    )}
                    
                    {/* Focus Items Actions */}
                    {msg.role === "assistant" && msg.focusItems && msg.focusItems.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.focusItems.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                item.type === 'task' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                                item.type === 'event' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' :
                                'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                              }`}>
                                {item.type === 'task' ? 'Task' : item.type === 'event' ? 'Evento' : 'Recupero'}
                              </span>
                              <span className="text-sm">{item.title}</span>
                            </div>
                            {item.action && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Fatto
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                                  <SkipForward className="h-3 w-3 mr-1" />
                                  Salta
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {msg.role === "assistant" && msg.source && (
                      <div className="flex items-center gap-2 mt-2 sm:mt-3 flex-wrap">
                        <Badge 
                          variant={msg.source === 'external' ? 'default' : msg.source === 'focus' ? 'secondary' : 'outline'} 
                          className="text-xs"
                        >
                          {msg.source === 'local' ? '⚡ Locale' : 
                           msg.source === 'focus' ? '🎯 Focus Engine' :
                           msg.source === 'fallback' ? '🔄 Fallback' : '🌐 AI Esterno'}
                        </Badge>
                        {msg.commandExecuted && (
                          <Badge variant="secondary" className="text-xs">
                            ✓ Comando eseguito
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
                    </div>
                  )}
                </div>
                
                {/* Timestamp */}
                <div className={`flex ${msg.role === "user" ? "justify-end mr-10 sm:mr-14" : "justify-start ml-10 sm:ml-14"}`}>
                  <span className="text-[10px] sm:text-xs text-muted-foreground/70">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                
                {/* Suggestions after assistant message */}
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && !msg.focusItems && (
                  <div className="ml-10 sm:ml-14 space-y-1.5 sm:space-y-2 mt-2">
                    {msg.suggestions.map((sug, sugIdx) => (
                      <motion.button
                        key={sugIdx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: sugIdx * 0.1 }}
                        onClick={() => sendMessage(sug.text)}
                        disabled={isLoading}
                        className="block text-left w-full p-2.5 sm:p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors text-xs sm:text-sm disabled:opacity-50"
                      >
                        {sug.text}
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-2 sm:gap-3 items-start"
              >
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 sm:h-5 sm:w-5 text-primary animate-pulse" />
                </div>
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs text-muted-foreground ml-1">Sto pensando…</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll anchor */}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="p-3 sm:p-6 border-t border-border bg-background">
        <div className="flex gap-2 sm:gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isLoading ? "Sto elaborando..." : "Chiedimi qualsiasi cosa..."}
            disabled={isLoading}
            className="flex-1 h-11 sm:h-12 rounded-xl border-border focus-visible:ring-primary text-sm sm:text-base"
          />
          <Button 
            onClick={() => sendMessage()} 
            disabled={isLoading || !input.trim()}
            className="h-11 sm:h-12 px-4 sm:px-6 rounded-xl shadow-sm"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
