import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Loader2, Wallet, ListTodo, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useExpenses } from '@/hooks/useExpenses';
import { useTasks } from '@/hooks/useTasks';
import { useTopCategories } from '@/hooks/useTopCategories';
import { useFrequentExpense } from '@/hooks/useFrequentExpense';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomSheet } from '@/components/BottomSheet';
import { CategoryChips } from '@/components/CategoryChips';
import { hapticImpact } from '@/utils/haptics';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { cn } from '@/lib/utils';
import { toast as sonnerToast } from 'sonner';

type Tab = 'expense' | 'task';

// Routes where the global FAB should NOT appear
const HIDDEN_ROUTES = ['/auth', '/onboarding', '/terms', '/privacy', '/terms-and-conditions', '/accept-terms', '/reset-password'];

export function QuickAddFab() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const currencySymbol = getCurrencySymbol(lang);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('food');
  const [taskTitle, setTaskTitle] = useState('');

  const { addExpense, deleteExpense } = useExpenses(userId);
  const { addTask } = useTasks(userId);
  const { data: topCategories = [] } = useTopCategories(userId);
  const { data: frequent } = useFrequentExpense(userId);

  // Long-press detection
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);

  // Hide on auth/onboarding/legal pages
  if (HIDDEN_ROUTES.some((r) => location.pathname.startsWith(r))) return null;
  if (!userId) return null;

  const promotedCategory = topCategories[0] || 'food';
  const initialCategory = (topCategories.includes(category) ? category : promotedCategory) as string;

  const openSheet = (preset?: { amount?: string; category?: string; tab?: Tab }) => {
    setTab(preset?.tab || 'expense');
    setAmount(preset?.amount ?? '');
    setDescription('');
    setCategory(preset?.category ?? initialCategory);
    setTaskTitle('');
    setOpen(true);
  };

  const handleClick = () => {
    if (longPressFiredRef.current) {
      // Long-press already handled — don't open empty sheet
      longPressFiredRef.current = false;
      return;
    }
    hapticImpact('medium');
    openSheet();
  };

  const handlePointerDown = () => {
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      // Long-press → repeat frequent expense
      if (frequent) {
        longPressFiredRef.current = true;
        hapticImpact('heavy');
        openSheet({
          amount: String(frequent.avgAmount),
          category: frequent.category,
          tab: 'expense',
        });
      }
    }, 600);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSubmitExpense = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ title: t('common.error'), description: t('expenses.amountError', { defaultValue: 'Importo non valido' }), variant: 'destructive' });
      return;
    }
    try {
      hapticImpact('light');
      const today = new Date().toISOString().split('T')[0];
      const result = await addExpense.mutateAsync({
        amount: numAmount,
        category,
        description: description.trim(),
        date: today,
      });
      const expenseId = (result as any)?.id;
      setOpen(false);
      setAmount('');
      setDescription('');
      sonnerToast(t('expenses.expenseAdded', { defaultValue: 'Spesa aggiunta' }), {
        description: `${formatCurrency(numAmount, lang, 2)} — ${t(`expenses.${category}`, { defaultValue: category })}`,
        action: expenseId ? {
          label: t('expenses.undo', { defaultValue: 'Annulla' }),
          onClick: () => deleteExpense.mutate(expenseId),
        } : undefined,
        duration: 5000,
      });
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmitTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const title = taskTitle.trim();
    if (!title) {
      toast({ title: t('common.error'), description: t('home.taskTitleRequired', { defaultValue: 'Titolo richiesto' }), variant: 'destructive' });
      return;
    }
    try {
      hapticImpact('light');
      const today = new Date().toISOString().split('T')[0];
      await addTask.mutateAsync({
        title,
        priority: 'medium',
        due_date: today,
      });
      setOpen(false);
      setTaskTitle('');
    } catch (err: any) {
      toast({ title: t('common.error'), description: err.message, variant: 'destructive' });
    }
  };

  // Cleanup
  useEffect(() => {
    return () => { if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current); };
  }, []);

  return (
    <>
      <motion.button
        type="button"
        aria-label={t('quickAdd.label', { defaultValue: 'Aggiungi rapidamente' })}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        initial={{ opacity: 0, scale: 0.6, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.1 }}
        whileTap={{ scale: 0.92 }}
        className={cn(
          'fab-container h-14 w-14 rounded-full flex items-center justify-center',
          'bg-primary text-primary-foreground',
          'shadow-[0_8px_24px_rgba(15,61,62,0.35)] active:shadow-[0_4px_12px_rgba(15,61,62,0.4)]',
          'transition-shadow'
        )}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>

      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={t('quickAdd.title', { defaultValue: 'Aggiungi rapidamente' })}
      >
        {/* Tab switcher */}
        <div className="segmented w-full grid grid-cols-2 mb-4">
          <button
            type="button"
            data-active={tab === 'expense'}
            onClick={() => { hapticImpact('light'); setTab('expense'); }}
            className="segmented-item text-center inline-flex items-center justify-center gap-1.5"
          >
            <Wallet className="h-4 w-4" />
            {t('quickAdd.expense', { defaultValue: 'Spesa' })}
          </button>
          <button
            type="button"
            data-active={tab === 'task'}
            onClick={() => { hapticImpact('light'); setTab('task'); }}
            className="segmented-item text-center inline-flex items-center justify-center gap-1.5"
          >
            <ListTodo className="h-4 w-4" />
            {t('quickAdd.task', { defaultValue: 'Task' })}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'expense' ? (
            <motion.form
              key="expense"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleSubmitExpense}
              className="space-y-4"
            >
              {/* Hint about long-press repeat */}
              {frequent && !amount && (
                <button
                  type="button"
                  onClick={() => openSheet({ amount: String(frequent.avgAmount), category: frequent.category, tab: 'expense' })}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/60 text-left pressable"
                >
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      {t('quickAdd.frequentHint', { defaultValue: 'Spesa frequente' })}
                    </p>
                    <p className="text-[13px] font-medium truncate">
                      {formatCurrency(frequent.avgAmount, lang)} · {t(`expenses.${frequent.category}`, { defaultValue: frequent.category })}
                    </p>
                  </div>
                </button>
              )}

              {/* Amount input — big */}
              <div className="flex items-baseline gap-1 px-1">
                <span className="text-[28px] text-muted-foreground font-medium">{currencySymbol}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.,]/g, '');
                    setAmount(v);
                  }}
                  placeholder="0,00"
                  autoFocus
                  className="flex-1 border-0 bg-transparent text-[34px] font-bold p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/30 tabular-nums"
                />
              </div>

              {/* Description — optional in this quick form */}
              <Input
                type="text"
                data-testid="quickadd-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('quickAdd.descriptionPlaceholder', { defaultValue: 'Descrizione (es. Caffè, Supermercato...)' })}
                maxLength={200}
                className="h-11 text-[15px] rounded-xl"
              />

              {/* Category chips */}
              <CategoryChips
                value={category}
                onChange={setCategory}
                topCategories={topCategories}
              />

              <Button
                type="submit"
                disabled={addExpense.isPending || !amount || parseFloat(amount.replace(',', '.')) <= 0}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold"
              >
                {addExpense.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('quickAdd.saveExpense', { defaultValue: 'Aggiungi spesa' })
                )}
              </Button>
            </motion.form>
          ) : (
            <motion.form
              key="task"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleSubmitTask}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label htmlFor="qa-task-title" className="text-[13px] font-medium text-muted-foreground">
                  {t('quickAdd.taskTitle', { defaultValue: 'Cosa devi fare?' })}
                </label>
                <Input
                  id="qa-task-title"
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={t('quickAdd.taskPlaceholder', { defaultValue: 'Es: Pagare bolletta luce' })}
                  autoFocus
                  maxLength={140}
                  className="h-12 text-[16px] rounded-xl"
                />
              </div>
              <p className="text-[12px] text-muted-foreground px-1">
                {t('quickAdd.taskDefaultsHint', { defaultValue: 'Priorità media · Scadenza oggi' })}
              </p>
              <Button
                type="submit"
                disabled={addTask.isPending || !taskTitle.trim()}
                className="w-full h-12 rounded-2xl text-[15px] font-semibold"
              >
                {addTask.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('quickAdd.saveTask', { defaultValue: 'Aggiungi task' })
                )}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </BottomSheet>
    </>
  );
}

export default QuickAddFab;
