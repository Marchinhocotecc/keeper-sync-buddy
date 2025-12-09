import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { processMessage, getAdaptiveSuggestionsForUser } from "@/agent";
import type { AgentResponse } from "@/agent";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: 'local' | 'external';
  suggestions?: Array<{ text: string; priority: string }>;
  timestamp: Date;
}

interface ChatEntry {
  user: string;
  assistant: string;
}

const CONTEXT_STORAGE_KEY = "assistant_context_chats";
const MAX_CONTEXT_CHATS = 5;

// Load context from localStorage
const loadContextChats = (): ChatEntry[] => {
  try {
    const stored = localStorage.getItem(CONTEXT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Error loading context:", error);
  }
  return [];
};

// Save context to localStorage
const saveContextChats = (chats: ChatEntry[]) => {
  try {
    // Keep only last 5 chats
    const trimmed = chats.slice(-MAX_CONTEXT_CHATS);
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error("Error saving context:", error);
  }
};

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
  const [contextChats, setContextChats] = useState<ChatEntry[]>([]);
  
  const lastCallRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isRequestingRef = useRef(false);

  // Load context on mount
  useEffect(() => {
    setContextChats(loadContextChats());
  }, []);

  // Autoscroll to bottom when messages change
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

  // Load adaptive suggestions on mount
  useEffect(() => {
    if (userId && messages.length === 0) {
      loadSuggestions();
    }
  }, [userId]);

  const loadSuggestions = async () => {
    if (!userId) return;
    
    try {
      const sugs = await getAdaptiveSuggestionsForUser(userId);
      setSuggestions(sugs);
    } catch (error) {
      // Silent fail for suggestions
    }
  };

  const sendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading || !userId) return;

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

    const userMessage: Message = { 
      role: "user", 
      content: textToSend,
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setSuggestions([]);

    try {
      // Build context array from stored chats
      const contextMessages = contextChats.flatMap(chat => [
        { role: "user" as const, content: chat.user },
        { role: "assistant" as const, content: chat.assistant }
      ]);

      const response: AgentResponse = await processMessage(
        textToSend, 
        userId, 
        { contextMessages }
      );
      
      const assistantMessage: Message = {
        role: "assistant",
        content: response.message,
        source: response.source,
        suggestions: response.suggestions,
        timestamp: new Date()
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      // Save new chat to context
      const newChat: ChatEntry = {
        user: textToSend,
        assistant: response.message
      };
      const updatedChats = [...contextChats, newChat].slice(-MAX_CONTEXT_CHATS);
      setContextChats(updatedChats);
      saveContextChats(updatedChats);

      // Handle navigation if requested
      if (response.data?.navigateTo) {
        setTimeout(() => navigate(response.data.navigateTo), 500);
      }

      // Show suggestions if available
      if (response.suggestions && response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
      }

      if (!response.success) {
        toast({
          title: "Attenzione",
          description: response.message,
          variant: "default",
        });
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
  }, [input, isLoading, userId, toast, navigate, contextChats]);

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
                    {msg.role === "assistant" && msg.source && (
                      <Badge variant="outline" className="mt-2 sm:mt-3 text-xs">
                        {msg.source === 'local' ? '⚡ Locale' : '🌐 AI Esterno'}
                      </Badge>
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
                {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
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
                    <span className="text-xs text-muted-foreground ml-1">Sto scrivendo…</span>
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
            placeholder={isLoading ? "Attendere risposta..." : "Chiedimi qualsiasi cosa..."}
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
