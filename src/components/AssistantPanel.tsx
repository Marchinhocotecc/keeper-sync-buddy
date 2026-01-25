import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Zap, User, Lightbulb, Trash2, ArrowUp } from "lucide-react";
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
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
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
        { text: "What should I focus on today?", priority: "high" },
        { text: "Show tasks", priority: "medium" },
        { text: "Show events", priority: "medium" },
        { text: "Show expenses", priority: "low" },
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
    "Show tasks": "__UI_ACTION__:SHOW_TASKS",
    "Show events": "__UI_ACTION__:SHOW_EVENTS",
    "Show expenses": "__UI_ACTION__:SHOW_EXPENSES",
    // Create actions
    "Aggiungi task": "__UI_ACTION__:ADD_TASK",
    "Aggiungi evento": "__UI_ACTION__:CREATE_EVENT",
    "Add task": "__UI_ACTION__:ADD_TASK",
    "Add event": "__UI_ACTION__:CREATE_EVENT",
    // Delete all actions
    "Elimina tutti": "__UI_ACTION__:DELETE_ALL",
    "Delete all": "__UI_ACTION__:DELETE_ALL",
    // Complete all actions
    "Completa tutte": "__UI_ACTION__:COMPLETE_ALL_TASKS",
    "Complete all": "__UI_ACTION__:COMPLETE_ALL_TASKS",
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
        title: "History cleared",
        description: "Assistant memory has been reset.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not clear history.",
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
        title: "Wait",
        description: "Please wait before sending another message",
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
      // Call Edge Function directly
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
        
        const fallbackMessage: Message = {
          role: "assistant",
          content: "Connection issue. Want to try again?",
          timestamp: new Date(),
          suggestions: ["Retry", "Show tasks", "Show events", "Add task"]
        };
        setMessages((prev) => [...prev, fallbackMessage]);
        setSuggestions([
          { text: "Retry", priority: "high" },
          { text: "Show tasks", priority: "medium" },
          { text: "Show events", priority: "medium" },
        ]);
        return;
      }
      
      console.log("[AssistantPanel] AI response:", data);
      
      if (data.intent === "ERROR") {
        console.warn("[AssistantPanel] AI returned error intent:", data.error);
      }
      
      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply || "How can I help?",
        timestamp: new Date(),
        suggestions: data.suggestions
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      if (data.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions.map((s: string) => ({ text: s, priority: 'medium' })));
      }
    } catch (error: any) {
      console.error("[AssistantPanel] Unexpected error:", error);
      
      const fallbackMessage: Message = {
        role: "assistant",
        content: "Something went wrong. Try rephrasing or use the quick actions below.",
        timestamp: new Date(),
        suggestions: ["Show tasks", "Show events", "Add task"]
      };
      setMessages((prev) => [...prev, fallbackMessage]);
      setSuggestions([
        { text: "Show tasks", priority: "high" },
        { text: "Show events", priority: "medium" },
        { text: "Add task", priority: "medium" },
      ]);
    } finally {
      setIsLoading(false);
      isRequestingRef.current = false;
    }
  }, [input, isLoading, userId, toast]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      debounceTimerRef.current = setTimeout(() => {
        sendMessage();
      }, 200);
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
    hidden: { opacity: 0, y: 8 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.2, ease: "easeOut" as const }
    }
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] bg-card border-border rounded-xl">
      {/* Header with clear button */}
      {messages.length > 0 && (
        <div className="flex justify-end px-4 pt-3 border-b border-border pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearHistory}
            className="text-muted-foreground hover:text-destructive h-7 px-2 rounded-md"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Clear</span>
          </Button>
        </div>
      )}
      
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 sm:p-5"
      >
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
                <h3 className="text-base font-medium mb-1.5 text-foreground">Your Assistant</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                  I'm here to help you manage tasks, events, and expenses. Ask away.
                </p>
                
                {suggestions.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <Lightbulb className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Try asking</span>
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
                <div
                  className={`flex gap-2 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                      <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2.5 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted border border-border"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
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
                
                {/* Inline suggestions after assistant message */}
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2 justify-start"
            >
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
      
      {/* Quick action buttons */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-border flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Show tasks")}
            disabled={isLoading}
            className="text-xs h-7 rounded-md"
          >
            📋 Tasks
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Show events")}
            disabled={isLoading}
            className="text-xs h-7 rounded-md"
          >
            📅 Events
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage("Add task")}
            disabled={isLoading}
            className="text-xs h-7 rounded-md"
          >
            ➕ New task
          </Button>
        </div>
      )}

      {/* Input area */}
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
