import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { FinancialInsightCard } from '@/components/FinancialInsightCard';
import { useFinancialInsights } from '@/hooks/useFinancialInsights';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, TrendingUp, Wallet, Loader2, Pencil, UtensilsCrossed, Car, Film, ShoppingBag, Pill, FileText, Tag } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BudgetCard } from '@/components/BudgetCard';
import { BudgetEditModal } from '@/components/BudgetEditModal';
import { getMonthlyBudget, upsertMonthlyBudget } from '@/services/budgetService';
import { Skeleton } from '@/components/ui/skeleton';
import { PageTransition } from '@/components/PageTransition';
import { PullToRefresh } from '@/components/PullToRefresh';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { useQueryClient } from '@tanstack/react-query';
import { toast as sonnerToast } from 'sonner';
import { MobilePageHeader } from '@/components/MobilePageHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { FAB } from '@/components/FAB';
import { hapticImpact } from '@/utils/haptics';
import { cn } from '@/lib/utils';

const COLORS = ['#0F3D3E', '#145A5B', '#1E6F70', '#2E7D32', '#E6A23C', '#D64545', '#6B7280'];

const CATEGORY_META: Record<string, { icon: React.ComponentType<any>; tint: string }> = {
  food:          { icon: UtensilsCrossed, tint: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  transport:     { icon: Car,             tint: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  entertainment: { icon: Film,            tint: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  shopping:      { icon: ShoppingBag,     tint: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
  health:        { icon: Pill,            tint: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  bills:         { icon: FileText,        tint: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  other:         { icon: Tag,             tint: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
};

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.other;
  const Icon = meta.icon;
  return (
    <div className={cn('shrink-0 h-10 w-10 rounded-2xl flex items-center justify-center', meta.tint, className)}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function FinancialInsightSection({ userId }: { userId: string }) {
  const { insight } = useFinancialInsights(userId);
  if (!insight) return null;
  return (
    <div className="mb-5 animate-fade-in">
      <FinancialInsightCard insight={insight} userId={userId} />
    </div>
  );
}

interface SwipeRowProps {
  expense: any;
  onDelete: () => void;
  dateLocale: string;
  noDescription: string;
  lang: string;
}

function ExpenseRow({ expense, onDelete, dateLocale, noDescription, lang }: SwipeRowProps) {
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -90 || info.velocity.x < -500) {
      hapticImpact('medium');
      onDelete();
    }
  };

  const dateLabel = new Date(expense.date + 'T00:00:00').toLocaleDateString(dateLocale, {
    day: '2-digit', month: 'short',
  });

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Underlay (delete) */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 bg-destructive">
        <Trash2 className="h-5 w-5 text-destructive-foreground" />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={{ left: 0.2, right: 0 }}
        onDragEnd={handleDragEnd}
        whileTap={{ cursor: 'grabbing' }}
        className="relative flex items-center gap-3 p-3 bg-card border border-border/60 rounded-2xl touch-pan-y"
      >
        <CategoryIcon category={expense.category || 'other'} />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-foreground truncate">
            {expense.description || noDescription}
          </p>
          <p className="text-[12px] text-muted-foreground capitalize">
            {expense.category || 'other'} · {dateLabel}
          </p>
        </div>
        <div className="text-[15px] font-semibold text-foreground tabular-nums shrink-0">
          {formatCurrency(parseFloat(String(expense.amount)), lang)}
        </div>
      </motion.div>
    </div>
  );
}

export default function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const { expenses, isLoading, addExpense, deleteExpense } = useExpenses(userId);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [budget, setBudget] = useState(0);
  const [budgetNote, setBudgetNote] = useState('');

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const currencySymbol = getCurrencySymbol(i18n.language);
  const lang = i18n.language;

  useEffect(() => {
    if (!userId) return;
    setIsLoadingBudget(true);
    getMonthlyBudget(userId, currentMonth, currentYear)
      .then((amount) => setBudget(amount))
      .finally(() => setIsLoadingBudget(false));
  }, [userId, currentMonth, currentYear]);

  const handleSaveBudget = useCallback(async (newBudget: number, note: string) => {
    if (!userId) return;
    setIsSavingBudget(true);
    try {
      const result = await upsertMonthlyBudget(userId, currentMonth, currentYear, newBudget);
      if (!result.success) throw new Error(result.error || 'Unknown error');
      setBudget(newBudget);
      setBudgetNote(note);
      setShowBudgetModal(false);
      toast({ title: t('expenses.budgetSaved') });
    } catch (err: any) {
      toast({ title: t('expenses.budgetSaveError'), description: err.message, variant: 'destructive' });
    } finally {
      setIsSavingBudget(false);
    }
  }, [userId, currentMonth, currentYear, toast, t]);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    amount: '', category: 'food', description: '', date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: t('common.error'), description: t('expenses.amountError'), variant: 'destructive' });
      return;
    }
    if (!formData.category) {
      toast({ title: t('common.error'), description: t('expenses.categoryError'), variant: 'destructive' });
      return;
    }
    const localDate = new Date(formData.date + 'T00:00:00');
    const utcDate = localDate.toISOString().split('T')[0];
    const result = await addExpense.mutateAsync({
      amount, category: formData.category, description: formData.description, date: utcDate,
    });
    setFormData({ amount: '', category: 'food', description: '', date: new Date().toISOString().split('T')[0] });
    setShowAddSheet(false);
    hapticImpact('light');

    const expenseId = (result as any)?.id;
    sonnerToast(t('expenses.expenseAdded'), {
      description: `${formatCurrency(amount, lang, 2)} — ${t(`expenses.${formData.category}`)}`,
      action: expenseId ? {
        label: t('expenses.undo'),
        onClick: () => deleteExpense.mutate(expenseId),
      } : undefined,
      duration: 5000,
    });
  };

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const filteredExpenses = Array.isArray(expenses) ? expenses : [];

  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const cm = now.getMonth();
    const cy = now.getFullYear();
    return filteredExpenses.filter((exp) => {
      const d = new Date(exp.date);
      return d.getMonth() === cm && d.getFullYear() === cy;
    });
  }, [filteredExpenses]);

  const categoryData = useMemo(() => {
    const grouped = currentMonthExpenses.reduce((acc, exp) => {
      const cat = exp.category || 'other';
      acc[cat] = (acc[cat] || 0) + parseFloat(String(exp.amount));
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([name, value]) => ({
      name: t(`expenses.${name}`, { defaultValue: name.charAt(0).toUpperCase() + name.slice(1) }),
      value: parseFloat(value.toFixed(2)),
    }));
  }, [currentMonthExpenses, t]);

  const totalExpenses = currentMonthExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount)), 0);
  const remaining = budget - totalExpenses;
  const progressPct = budget > 0 ? Math.min(100, Math.round((totalExpenses / budget) * 100)) : 0;
  const progressColor = progressPct >= 100 ? 'bg-destructive' : progressPct >= 80 ? 'bg-warning' : 'bg-primary';

  const dateLocale = `${i18n.language}-${i18n.language.toUpperCase()}`;

  if (isLoading || isLoadingBudget) {
    return (
      <div className="min-h-screen bg-background">
        <div className="page-container">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-6 w-64 mb-6" />
          <Skeleton className="h-32 rounded-2xl mb-4" />
          <div className="grid gap-3 grid-cols-2 mb-4">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <main className="min-h-screen bg-background pb-28 sm:pb-0">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="page-container">
            <MobilePageHeader
              title={t('expenses.title')}
              subtitle={t('expenses.manageExpenses')}
              action={
                <Button
                  onClick={() => setShowAddSheet(true)}
                  size="sm"
                  className="hidden sm:flex gap-2 rounded-xl h-9 px-4"
                >
                  <Plus className="h-4 w-4" />
                  {t('expenses.addExpense')}
                </Button>
              }
            />

            {/* Hero budget card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="card-ios p-5 mb-4"
              role="button"
              onClick={() => setShowBudgetModal(true)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('expenses.budget')}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowBudgetModal(true); }}
                  className="h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('expenses.editBudget')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[28px] sm:text-[32px] font-bold tracking-tight text-foreground tabular-nums">
                  {formatCurrency(totalExpenses, lang)}
                </span>
                <span className="text-[14px] text-muted-foreground">
                  / {formatCurrency(budget, lang, 0)}
                </span>
              </div>
              {budget > 0 ? (
                <>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', progressColor)}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[12px] text-muted-foreground">{progressPct}%</span>
                    <span className={cn(
                      'text-[13px] font-semibold tabular-nums',
                      remaining < 0 ? 'text-destructive' : 'text-success'
                    )}>
                      {remaining < 0 ? '−' : ''}{formatCurrency(Math.abs(remaining), lang)} {t('expenses.remaining')}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground mt-2">
                  {t('expenses.budgetNotePlaceholder', { defaultValue: 'Imposta un budget mensile per tracciare le spese' })}
                </p>
              )}
            </motion.div>

            {/* Quick add inline pill */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="card-ios mb-5 p-3 flex items-center gap-2"
            >
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder={currencySymbol}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-24 h-11 text-[15px] rounded-xl border-transparent bg-muted/60"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && formData.amount && parseFloat(formData.amount) > 0) {
                    e.preventDefault();
                    const amount = parseFloat(formData.amount);
                    const today = new Date().toISOString().split('T')[0];
                    hapticImpact('light');
                    const result = await addExpense.mutateAsync({
                      amount, category: formData.category, description: '', date: today,
                    });
                    setFormData({ ...formData, amount: '' });
                    const expenseId = (result as any)?.id;
                    sonnerToast(t('expenses.expenseAdded'), {
                      description: `${formatCurrency(amount, lang, 2)} — ${t(`expenses.${formData.category}`)}`,
                      action: expenseId ? {
                        label: t('expenses.undo'),
                        onClick: () => deleteExpense.mutate(expenseId),
                      } : undefined,
                      duration: 5000,
                    });
                  }
                }}
              />
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger className="flex-1 h-11 text-[14px] rounded-xl border-transparent bg-muted/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">{t('expenses.food')}</SelectItem>
                  <SelectItem value="transport">{t('expenses.transport')}</SelectItem>
                  <SelectItem value="entertainment">{t('expenses.entertainment')}</SelectItem>
                  <SelectItem value="shopping">{t('expenses.shopping')}</SelectItem>
                  <SelectItem value="health">{t('expenses.health')}</SelectItem>
                  <SelectItem value="bills">{t('expenses.bills')}</SelectItem>
                  <SelectItem value="other">{t('expenses.other')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="icon"
                onClick={async () => {
                  if (!formData.amount || parseFloat(formData.amount) <= 0) return;
                  const amount = parseFloat(formData.amount);
                  const today = new Date().toISOString().split('T')[0];
                  hapticImpact('light');
                  const result = await addExpense.mutateAsync({
                    amount, category: formData.category, description: '', date: today,
                  });
                  setFormData({ ...formData, amount: '' });
                  const expenseId = (result as any)?.id;
                  sonnerToast(t('expenses.expenseAdded'), {
                    description: `${formatCurrency(amount, lang, 2)} — ${t(`expenses.${formData.category}`)}`,
                    action: expenseId ? {
                      label: t('expenses.undo'),
                      onClick: () => deleteExpense.mutate(expenseId),
                    } : undefined,
                    duration: 5000,
                  });
                }}
                disabled={!formData.amount || parseFloat(formData.amount) <= 0 || addExpense.isPending}
                className="h-11 w-11 rounded-xl shrink-0"
              >
                {addExpense.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
              </Button>
            </motion.div>

            <FinancialInsightSection userId={userId} />

            {/* Budget summary cards (desktop side-by-side; on mobile compact) */}
            <div className="hidden sm:grid gap-3 grid-cols-3 mb-5">
              <Card className="card-ios">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="app-card-title">{t('expenses.totalExpenses')}</span>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="app-card-value">{formatCurrency(totalExpenses, lang)}</div>
                </CardContent>
              </Card>
              <BudgetCard budget={budget} onEditClick={() => setShowBudgetModal(true)} />
              <Card className={cn('card-ios', remaining < 0 && 'border-destructive/50')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="app-card-title">{t('expenses.remaining')}</span>
                  </div>
                  <div className={cn('app-card-value', remaining < 0 ? 'text-destructive' : 'text-success')}>
                    {formatCurrency(remaining, lang)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Recent expenses list */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-[17px] font-semibold tracking-tight">
                    {t('expenses.recentExpenses')}
                  </h2>
                  {filteredExpenses.length > 0 && (
                    <span className="text-[12px] text-muted-foreground">
                      {filteredExpenses.length}
                    </span>
                  )}
                </div>

                {filteredExpenses.length === 0 ? (
                  <div className="card-ios py-12 text-center">
                    <div className="mx-auto h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                      <Wallet className="h-7 w-7 text-muted-foreground/60" />
                    </div>
                    <p className="text-[14px] text-muted-foreground mb-4">{t('expenses.noExpenses')}</p>
                    <Button
                      variant="outline"
                      onClick={() => setShowAddSheet(true)}
                      className="gap-2 rounded-xl"
                    >
                      <Plus className="h-4 w-4" />
                      {t('expenses.addExpense')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
                    <AnimatePresence initial={false}>
                      {filteredExpenses.slice(0, 20).map((expense) => (
                        <motion.div
                          key={expense.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -100, transition: { duration: 0.2 } }}
                          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        >
                          <ExpenseRow
                            expense={expense}
                            onDelete={() => setDeleteTarget(expense.id)}
                            dateLocale={dateLocale}
                            noDescription={t('expenses.noDescription')}
                            lang={lang}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <p className="text-center text-[11px] text-muted-foreground/70 pt-3 sm:hidden">
                      {t('expenses.swipeHint', { defaultValue: '← Scorri per eliminare' })}
                    </p>
                  </div>
                )}
              </div>

              {/* Pie chart */}
              {categoryData.length > 0 && (
                <div className="card-ios p-4 sm:p-5">
                  <h2 className="text-[17px] font-semibold tracking-tight mb-3">
                    {t('expenses.byCategory')}
                  </h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value, lang)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                    {categoryData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 text-[13px]">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="truncate text-muted-foreground">{entry.name}</span>
                        <span className="ml-auto font-semibold text-foreground tabular-nums">
                          {formatCurrency(entry.value, lang, 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </PullToRefresh>

        {/* Floating Action Button (mobile) */}
        <FAB
          icon={<Plus className="h-6 w-6" />}
          ariaLabel={t('expenses.addExpense')}
          onClick={() => setShowAddSheet(true)}
        />

        {/* Add expense bottom sheet */}
        <BottomSheet
          open={showAddSheet}
          onOpenChange={setShowAddSheet}
          title={t('expenses.addExpense')}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-[13px] font-medium">{t('expenses.amountRequired')}</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                className="h-12 text-[16px] rounded-xl"
                inputMode="decimal"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category" className="text-[13px] font-medium">{t('expenses.categoryRequired')}</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger id="category" className="h-12 text-[15px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">{t('expenses.food')}</SelectItem>
                  <SelectItem value="transport">{t('expenses.transport')}</SelectItem>
                  <SelectItem value="entertainment">{t('expenses.entertainment')}</SelectItem>
                  <SelectItem value="shopping">{t('expenses.shopping')}</SelectItem>
                  <SelectItem value="health">{t('expenses.health')}</SelectItem>
                  <SelectItem value="bills">{t('expenses.bills')}</SelectItem>
                  <SelectItem value="other">{t('expenses.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date" className="text-[13px] font-medium">{t('expenses.dateRequired')}</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="h-12 text-[15px] rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-[13px] font-medium">{t('expenses.notes')}</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                maxLength={200}
                className="h-12 text-[15px] rounded-xl"
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddSheet(false)}
                className="flex-1 h-12 rounded-xl"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={addExpense.isPending}
                className="flex-1 h-12 rounded-xl font-semibold"
              >
                {addExpense.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.save')}
              </Button>
            </div>
          </form>
        </BottomSheet>

        <BudgetEditModal
          open={showBudgetModal}
          onOpenChange={setShowBudgetModal}
          currentBudget={budget}
          currentNote={budgetNote}
          onSave={handleSaveBudget}
          isSaving={isSavingBudget}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
              <AlertDialogDescription>{t('common.deleteConfirmGeneric')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                onClick={() => {
                  if (deleteTarget) {
                    deleteExpense.mutate(deleteTarget);
                    setDeleteTarget(null);
                  }
                }}
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </PageTransition>
  );
}
