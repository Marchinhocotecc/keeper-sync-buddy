import React, { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AssistantPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const lastCallRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const invokeAssistant = useCallback(async (messageText: string, retryCount = 0): Promise<any> => {
    try {
      const { data, error } = await supabase.functions.invoke("assistant-ai", {
        body: { prompt: messageText, userId },
      });

      // Check for Supabase client errors (network, etc.)
      if (error) {
        console.error(`Assistant API error (attempt ${retryCount + 1}):`, error);
        throw new Error(error.message || "Errore di connessione");
      }

      // New response format: always { success, message, timestamp, cached }
      if (!data) {
        throw new Error("Nessuna risposta dal server");
      }

      // Log cache status
      if (data.cached) {
        devLog("Response from cache");
      }

      return data;
    } catch (err) {
      console.error("invokeAssistant error:", err);
      throw err;
    }
  }, [userId]);

  const devLog = (...args: any[]) => {
    // Only log in development
    if (import.meta.env.DEV) {
      console.log(...args);
    }
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    // Prevent spam: minimum 1s between requests (aligned with backend)
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

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const messageText = input;
    setInput("");
    setIsLoading(true);

    try {
      const data = await invokeAssistant(messageText);
      
      // New response format: { success, message, timestamp, cached }
      if (data?.success) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.message,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        
        // Show cache indicator if response was cached
        if (data.cached) {
          devLog("✓ Risposta dalla cache");
        }
      } else {
        // Handle failure responses (still status 200 but success: false)
        console.warn("Assistant returned failure:", data);
        
        toast({
          title: "Attenzione",
          description: data?.message || "Impossibile ottenere una risposta",
          variant: "default",
        });
        
        // Remove user message on failure
        setMessages((prev) => prev.slice(0, -1));
      }
    } catch (error: any) {
      console.error("Assistant error:", error);
      
      const errorMessage = error.message || "Impossibile ottenere una risposta dall'assistente";
      
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Remove user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, userId, toast, invokeAssistant]);

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
    <Card className="flex flex-col h-[calc(100vh-12rem)]">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{isLoading ? "Assistente in elaborazione..." : t("assistant.placeholder")}</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === "user" && (
                <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-accent" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="bg-muted rounded-lg p-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t("assistant.placeholder")}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
