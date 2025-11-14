import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Bot, User, Sparkles, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { processMessage, getAdaptiveSuggestionsForUser } from "@/agent";
import type { AgentResponse } from "@/agent";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: 'local' | 'external';
  suggestions?: Array<{ text: string; priority: string }>;
}

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
      console.error('Error loading suggestions:', error);
    }
  };

  const sendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading || !userId) return;

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

    const userMessage: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setSuggestions([]);

    try {
      const response: AgentResponse = await processMessage(textToSend, userId);
      
      const assistantMessage: Message = {
        role: "assistant",
        content: response.message,
        source: response.source,
        suggestions: response.suggestions
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

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
      console.error("Agent error:", error);
      
      toast({
        title: "Errore",
        description: error.message || "Errore nell'elaborazione del messaggio",
        variant: "destructive",
      });
      
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, userId, toast, navigate]);

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

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <Card className="flex flex-col h-[calc(100vh-12rem)] bg-background border-border">
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-6">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">Assistente AI Ibrido</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Gestisco localmente il 90% delle tue richieste. Chiedi pure!
              </p>
              
              {suggestions.length > 0 && (
                <div className="mt-8 space-y-3">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">Suggerimenti per te</span>
                  </div>
                  {suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(sug.text)}
                      className="block w-full max-w-md mx-auto text-left p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Badge variant={sug.priority === 'high' ? 'destructive' : sug.priority === 'medium' ? 'default' : 'secondary'} className="mt-0.5">
                          {sug.priority}
                        </Badge>
                        <span className="text-sm text-foreground flex-1">{sug.text}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className="space-y-2">
              <div
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl p-4 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card border border-border shadow-sm"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.role === "assistant" && msg.source && (
                    <Badge variant="outline" className="mt-3 text-xs">
                      {msg.source === 'local' ? '⚡ Locale' : '🌐 AI Esterno'}
                    </Badge>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-accent" />
                  </div>
                )}
              </div>
              
              {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
                <div className="ml-14 space-y-2">
                  {msg.suggestions.map((sug, sugIdx) => (
                    <button
                      key={sugIdx}
                      onClick={() => sendMessage(sug.text)}
                      className="block text-left w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm"
                    >
                      {sug.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 items-start">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex gap-2">
                  <div className="h-2.5 w-2.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2.5 w-2.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2.5 w-2.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-6 border-t border-border bg-background">
        <div className="flex gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Chiedimi qualsiasi cosa..."
            disabled={isLoading}
            className="flex-1 h-12 rounded-xl border-border focus-visible:ring-primary"
          />
          <Button 
            onClick={() => sendMessage()} 
            disabled={isLoading || !input.trim()}
            className="h-12 px-6 rounded-xl shadow-sm"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
