import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles, Lightbulb, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: string[];
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

  // Set default suggestions on mount
  useEffect(() => {
    if (userId && messages.length === 0) {
      setSuggestions([
        { text: "Cosa dovrei fare oggi?", priority: "high" },
        { text: "Mostra task", priority: "medium" },
        { text: "Mostra eventi", priority: "medium" },
        { text: "Mostra spese", priority: "low" },
      ]);
    }
  }, [userId, messages.length]);

  /**
   * UI_ACTION_MAP: Maps UI button labels to structured action payloads.
   * These bypass AI parsing and execute deterministically.
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
    // Singular actions
    "Completa uno": "__UI_ACTION__:COMPLETE_ONE",
    "Elimina uno": "__UI_ACTION__:DELETE_ONE",
    "Elimina una": "__UI_ACTION__:DELETE_ONE",
  };

  const handleClearHistory = async () => {
    if (!userId) return;
    
    try {
      // Clear local state
      setMessages([]);
      
      // Clear server-side assistant state
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
    
    // Map UI quick action labels to structured payloads (bypass AI)
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
      // Call Edge Function directly - NO legacy pipeline
      console.log("[AssistantPanel] Calling ai-free-chat edge function");
      
      const { data, error } = await supabase.functions.invoke("ai-free-chat", {
        body: {
          userMessage: textToSend,
          userId,
          locale: "it"
        }
      });
      
      // Handle edge function invocation error
      if (error) {
        console.error("[AssistantPanel] Edge function invocation error:", error);
        
        // Show helpful fallback message instead of generic error
        const fallbackMessage: Message = {
          role: "assistant",
          content: "Ho avuto un problema di connessione. Vuoi riprovare o preferisci fare qualcosa manualmente?",
          timestamp: new Date(),
          suggestions: ["Riprova", "Mostra task", "Mostra eventi", "Aggiungi task"]
        };
        setMessages((prev) => [...prev, fallbackMessage]);
        setSuggestions([
          { text: "Riprova", priority: "high" },
          { text: "Mostra task", priority: "medium" },
          { text: "Mostra eventi", priority: "medium" },
        ]);
        return;
      }
      
      console.log("[AssistantPanel] AI response:", data);
      
      // Handle error response from edge function (but with 200 status)
      if (data.intent === "ERROR") {
        console.warn("[AssistantPanel] AI returned error intent:", data.error);
      }
      
      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply || "Come posso aiutarti?",
        timestamp: new Date(),
        suggestions: data.suggestions
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      // Show suggestions if available
      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.map((s: string) => ({ text: s, priority: 'medium' })));
      }
    } catch (error: any) {
      console.error("[AssistantPanel] Unexpected error:", error);
      
      // User-friendly error message with action buttons
      const fallbackMessage: Message = {
        role: "assistant",
        content: "Ops! Qualcosa non ha funzionato. Prova a riformulare la richiesta o usa i pulsanti rapidi qui sotto.",
        timestamp: new Date(),
        suggestions: ["Mostra task", "Mostra eventi", "Aggiungi task"]
      };
      setMessages((prev) => [...prev, fallbackMessage]);
      setSuggestions([
        { text: "Mostra task", priority: "high" },
        { text: "Mostra eventi", priority: "medium" },
        { text: "Aggiungi task", priority: "medium" },
      ]);
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
                <h3 className="text-lg font-semibold mb-2 text-foreground">Il tuo Assistente Personale 💛</h3>
                <p className="text-muted-foreground mb-6 sm:mb-8 max-w-md mx-auto text-sm sm:text-base px-4">
                  Ciao! Sono qui per aiutarti a gestire task, eventi e spese. Dimmi pure!
                </p>
                
                {suggestions.length > 0 && (
                  <div className="mt-6 sm:mt-8 space-y-2 sm:space-y-3 px-2">
                    <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Prova a chiedere</span>
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
                            {sug.priority === 'high' ? '!' : sug.priority === 'medium' ? '•' : '○'}
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
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 sm:h-5 sm:w-5 text-accent-foreground" />
                    </div>
                  )}
                </div>
                <div className={`text-xs text-muted-foreground ${msg.role === "user" ? "text-right pr-12" : "pl-12"}`}>
                  {formatTime(msg.timestamp)}
                </div>
                
                {/* Inline suggestions after assistant message */}
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="pl-12 mt-2 flex flex-wrap gap-2">
                    {msg.suggestions.map((sug, sugIdx) => (
                      <Button
                        key={sugIdx}
                        variant="outline"
                        size="sm"
                        onClick={() => sendMessage(sug)}
                        disabled={isLoading}
                        className="text-xs h-7"
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3 justify-start"
            >
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={scrollRef} />
        </div>
      </div>
      
      {/* Quick action buttons */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-border flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Mostra task")}
            disabled={isLoading}
            className="text-xs"
          >
            📋 Task
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Mostra eventi")}
            disabled={isLoading}
            className="text-xs"
          >
            📅 Eventi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Aggiungi task")}
            disabled={isLoading}
            className="text-xs"
          >
            ➕ Nuovo task
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Elimina tutti")}
            disabled={isLoading}
            className="text-xs text-destructive hover:text-destructive"
          >
            🗑️ Elimina tutti
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 sm:p-4 border-t border-border">
        <div className="flex gap-2 sm:gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Scrivi un messaggio..."
            disabled={isLoading}
            className="flex-1 text-sm sm:text-base"
          />
          <Button 
            onClick={() => sendMessage()} 
            disabled={isLoading || !input.trim()}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
