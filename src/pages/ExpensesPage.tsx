import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FinancialInsightCard } from '@/components/FinancialInsightCard';
import { useFinancialInsights } from '@/hooks/useFinancialInsights';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, Undo2, Loader2 } from 'lucide-react';
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
const COLORS = ['#0F3D3E', '#145A5B', '#1E6F70', '#2E7D32', '#E6A23C', '#D64545', '#6B7280'];

function FinancialInsightSection({ userId }: { userId: string }) {
  const { insight } = useFinancialInsights(userId);
  if (!insight) return null;
  return (
    <div className="mb-6 animate-fade-in">
      <FinancialInsightCard insight={insight} userId={userId} />
    </div>
  );
}

export default function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>();
  const { expenses, isLoading, addExpense, deleteExpense } = useExpenses(userId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [budget, setBudget] = useState(0);
  const [budgetNote, setBudgetNote] = useState('');

  const [quickAmount, setQuickAmount] = useState('');
  const [quickCategory, setQuickCategory] = useState('food');

  // Swipe state for expense rows
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef(0);

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
      if (!result.success) throw new Error(result.error || "Unknown error");
      setBudget(newBudget);
      setBudgetNote(note);
      setShowBudgetModal(false);
      toast({ title: t('expenses.budgetSaved') });
    } catch (err: any) {
      toast({ title: t('expenses.budgetSaveError'), description: err.message, variant: "destructive" });
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
      toast({ title: t('common.error'), description: t('expenses.amountError'), variant: "destructive" });
      return;
    }
    if (!formData.category) {
      toast({ title: t('common.error'), description: t('expenses.categoryError'), variant: "destructive" });
      return;
    }
    const localDate = new Date(formData.date + 'T00:00:00');
    const utcDate = localDate.toISOString().split('T')[0];
    await addExpense.mutateAsync({ amount, category: formData.category, description: formData.description, date: utcDate });
    setFormData({ amount: '', category: 'food', description: '', date: new Date().toISOString().split('T')[0] });
    setShowAddForm(false);
  };

  const handleQuickAdd = async () => {
    const amount = parseFloat(quickAmount);
    if (isNaN(amount) || amount <= 0) return;
    const today = new Date().toISOString().split('T')[0];
    const result = await addExpense.mutateAsync({ amount, category: quickCategory, description: '', date: today });
    setQuickAmount('');

    // Undo toast with sonner
    const expenseId = (result as any)?.id;
    sonnerToast(t('expenses.expenseAdded'), {
      description: `${formatCurrency(amount, lang, 2)} — ${t(`expenses.${quickCategory}`)}`,
      action: expenseId ? {
        label: t('expenses.undo'),
        onClick: () => {
          deleteExpense.mutate(expenseId);
        },
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
    return filteredExpenses.filter(exp => {
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
      value: parseFloat(value.toFixed(2))
    }));
  }, [currentMonthExpenses, t]);

  const totalExpenses = currentMonthExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount)), 0);
  const remaining = budget - totalExpenses;

  const dateLocale = `${i18n.language}-${i18n.language.toUpperCase()}`;

  if (isLoading || isLoadingBudget) {
    return (
      <div className="min-h-screen bg-background">
        <div className="page-container">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-6 w-64 mb-6" />
          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <main className="min-h-screen bg-background pb-20 sm:pb-0">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="page-container">
            <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="page-title">{t('expenses.title')}</h1>
                <p className="page-subtitle">{t('expenses.manageExpenses')}</p>
              </div>
              <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-2 shadow-sm w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                <span>{t('expenses.addExpense')}</span>
              </Button>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
              <Card className="app-card">
                <CardHeader className="app-card-header">
                  <div className="flex items-center justify-between">
                    <CardTitle className="app-card-title">{t('expenses.totalExpenses')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent><div className="app-card-value">{formatCurrency(totalExpenses, lang)}</div></CardContent>
              </Card>
              <BudgetCard budget={budget} onEditClick={() => setShowBudgetModal(true)} />
              <Card className={`app-card ${remaining < 0 ? 'border-destructive/50' : ''}`}>
                <CardHeader className="app-card-header">
                  <div className="flex items-center justify-between">
                    <CardTitle className="app-card-title">{t('expenses.remaining')}</CardTitle>
                    <TrendingDown className={`h-4 w-4 ${remaining < 0 ? 'text-destructive' : 'text-success'}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`app-card-value ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>{formatCurrency(remaining, lang)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Quick add inline */}
            <Card className="app-card mb-6 animate-fade-in">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder={currencySymbol}
                    value={quickAmount}
                    onChange={(e) => setQuickAmount(e.target.value)}
                    className="w-24 h-9 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                  />
                  <Select value={quickCategory} onValueChange={setQuickCategory}>
                    <SelectTrigger className="w-32 h-9 text-sm">
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
                  <Button size="sm" onClick={handleQuickAdd} disabled={!quickAmount || parseFloat(quickAmount) <= 0} className="h-9 px-4">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <FinancialInsightSection userId={userId} />

            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
              <Card className="app-card">
                <CardHeader className="border-b border-border/50 px-4 sm:px-6 py-4">
                  <CardTitle className="text-base sm:text-lg font-semibold">{t('expenses.recentExpenses')}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {filteredExpenses.length === 0 ? (
                    <div className="text-center py-10">
                      <Wallet className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">{t('expenses.noExpenses')}</p>
                      <Button variant="outline" onClick={() => setShowAddForm(true)} className="gap-2 text-sm">
                        <Plus className="h-4 w-4" />{t('expenses.addExpense')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3 max-h-[400px] overflow-y-auto">
                      {filteredExpenses.slice(0, 10).map((expense) => (
                        <div
                          key={expense.id}
                          className="relative overflow-hidden rounded-lg"
                        >
                          {/* Swipe delete background */}
                          <div className="absolute inset-y-0 right-0 flex items-center justify-center w-16 bg-destructive">
                            <button onClick={() => setDeleteTarget(expense.id)} className="text-destructive-foreground p-2">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div
                            className="relative flex items-center justify-between p-3 border border-border/50 bg-card hover:bg-muted/50 transition-colors"
                            style={{
                              transform: swipedId === expense.id ? 'translateX(-64px)' : 'translateX(0)',
                              transition: 'transform 0.2s ease-out'
                            }}
                            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                            onTouchMove={(e) => {
                              const diff = e.touches[0].clientX - touchStartX.current;
                              if (diff < -30) setSwipedId(expense.id);
                            }}
                            onTouchEnd={() => {
                              // keep swiped if already set
                            }}
                            onClick={() => swipedId === expense.id && setSwipedId(null)}
                          >
                            <div className="flex-1 min-w-0 mr-3">
                              <p className="text-sm font-medium truncate">{expense.description || t('expenses.noDescription')}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(expense.date + 'T00:00:00').toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                              <span className="text-sm font-semibold">{formatCurrency(parseFloat(String(expense.amount)), lang)}</span>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(expense.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0 hidden sm:flex">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="app-card">
                <CardHeader className="border-b border-border/50 px-4 sm:px-6 py-4">
                  <CardTitle className="text-base sm:text-lg font-semibold">{t('expenses.byCategory')}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  {categoryData.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">{t('expenses.noData')}</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} outerRadius={70} fill="#8884d8" dataKey="value">
                            {categoryData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value, lang)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                        {categoryData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center gap-2 text-sm">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span className="truncate text-muted-foreground">{entry.name}</span>
                            <span className="ml-auto font-medium text-foreground">{formatCurrency(entry.value, lang, 0)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </PullToRefresh>

        <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('expenses.addExpense')}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">{t('expenses.amountRequired')}</Label>
                <Input id="amount" type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required min="0.01" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{t('expenses.categoryRequired')}</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger id="category"><SelectValue /></SelectTrigger>
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
                <Label htmlFor="date">{t('expenses.dateRequired')}</Label>
                <Input id="date" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('expenses.notes')}</Label>
                <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} maxLength={200} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">{t('common.save')}</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)} className="flex-1">{t('common.cancel')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <BudgetEditModal open={showBudgetModal} onOpenChange={setShowBudgetModal} currentBudget={budget} currentNote={budgetNote} onSave={handleSaveBudget} isSaving={isSavingBudget} />

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
              <AlertDialogDescription>{t('common.deleteConfirmGeneric')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) { deleteExpense.mutate(deleteTarget); setDeleteTarget(null); setSwipedId(null); } }}>
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </PageTransition>
  );
}
