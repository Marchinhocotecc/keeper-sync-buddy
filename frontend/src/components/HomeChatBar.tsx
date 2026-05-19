import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BottomSheet } from '@/components/BottomSheet';
import { hapticImpact } from '@/utils/haptics';
import { cn } from '@/lib/utils';

interface PromptChip {
  labelKey: string;
  defaultLabel: string;
  message: string;
}

const PROMPT_CHIPS: PromptChip[] = [
  { labelKey: 'home.chat_today_expenses',  defaultLabel: 'Spese di oggi',     message: 'Quanto ho speso oggi?' },
  { labelKey: 'home.chat_remaining_budget', defaultLabel: 'Budget residuo',    message: 'Quanto budget mi resta questo mese?' },
  { labelKey: 'home.chat_next_event',      defaultLabel: 'Prossimo evento',   message: 'Qual è il mio prossimo evento?' },
  { labelKey: 'home.chat_suggestion',      defaultLabel: 'Un consiglio',      message: 'Dammi un consiglio finanziario per oggi.' },
];

/**
 * Sticky chat bar in Home (Blocco B #6).
 * - 4 quick-prompt chips (horizontal scroll)
 * - Tap chip OR pill input → inline AI response in BottomSheet
 * - "Conversa di più" button navigates to /assistant
 */
export function HomeChatBar() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const userId = user?.id;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const askAI = async (text: string) => {
    if (!userId || !text.trim()) return;
    setOpen(true);
    setPendingMessage(text);
    setResponse(null);
    setLoading(true);
    hapticImpact('light');
    try {
      const { data, error } = await supabase.functions.invoke('ai-free-chat', {
        body: { userMessage: text, userId, locale: i18n.language },
      });
      if (error) throw error;
      const reply = data?.structured?.summary || data?.reply || t('assistant.how_can_i_help', { defaultValue: 'Come posso aiutarti?' });
      setResponse(reply);
    } catch (err: any) {
      setResponse(t('assistant.something_wrong', { defaultValue: 'Qualcosa è andato storto. Riprova.' }));
      if (import.meta.env.DEV) console.error('[HomeChatBar]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChipClick = (chipMessage: string) => {
    askAI(chipMessage);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    askAI(text);
  };

  const handleSheetClose = () => {
    setOpen(false);
    // Don't clear response immediately, let exit animation play
    setTimeout(() => {
      setResponse(null);
      setPendingMessage(null);
    }, 300);
  };

  const goToAssistant = () => {
    setOpen(false);
    navigate('/assistant');
  };

  // Hide if no userId
  if (!userId) return null;

  return (
    <>
      {/* Pill input + chip rail */}
      <div className="mb-4 space-y-2">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 bg-card border border-border/60 rounded-full pl-4 pr-1 h-12 shadow-sm focus-within:ring-2 focus-within:ring-primary/15 transition-all">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('home.chat_placeholder', { defaultValue: 'Chiedi ad Ayvro…' })}
              className="flex-1 bg-transparent border-0 outline-none text-[14px] placeholder:text-muted-foreground/70 min-w-0"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label={t('assistant.send', { defaultValue: 'Invia' })}
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-all',
                input.trim() ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground'
              )}
            >
              <Send className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
        </form>

        {/* Prompt chips horizontal scroll */}
        <div className="scroll-snap-x">
          {PROMPT_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleChipClick(chip.message)}
              className="pressable inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-muted/60 hover:bg-muted text-foreground text-[13px] font-medium border border-border/40 whitespace-nowrap transition-all"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {t(chip.labelKey, { defaultValue: chip.defaultLabel })}
            </button>
          ))}
        </div>
      </div>

      {/* Response sheet */}
      <BottomSheet
        open={open}
        onOpenChange={(o) => { if (!o) handleSheetClose(); }}
        title={pendingMessage ?? t('assistant.title', { defaultValue: 'Assistente' })}
      >
        <div className="min-h-[140px] flex flex-col">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="py-3"
                aria-live="polite"
                aria-label={t('common.loading', { defaultValue: 'Sto pensando…' })}
              >
                {/* Typing-bubble skeleton — 3 dots that pulse like iMessage */}
                <div className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-md bg-muted/70">
                  <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-typing-dot [animation-delay:-0.32s]" />
                  <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-typing-dot [animation-delay:-0.16s]" />
                  <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-typing-dot" />
                </div>
                {/* Skeleton lines for the upcoming reply */}
                <div className="mt-3 space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-muted/60 animate-pulse" />
                  <div className="h-3 w-3/5 rounded-full bg-muted/60 animate-pulse [animation-delay:120ms]" />
                </div>
              </motion.div>
            ) : response ? (
              <motion.div
                key="response"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex-1"
              >
                <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
                  {response}
                </p>
                <button
                  type="button"
                  onClick={goToAssistant}
                  className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-primary font-semibold hover:underline pressable"
                >
                  {t('home.continue_chat', { defaultValue: 'Continua a parlarne' })}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </BottomSheet>
    </>
  );
}

export default HomeChatBar;
