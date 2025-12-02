import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { useSettings } from '@/hooks/useSettings';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e'];

export default function ExpensesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [userId, setUserId] = React.useState<string | undefined>();
  const { expenses, isLoading, isError, error, addExpense, deleteExpense } = useExpenses(userId);
  const { settings } = useSettings(userId);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Budget state with debounced autosave
  const [budgetValue, setBudgetValue] = useState<string>('0');
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load budget from settings when available
  useEffect(() => {
    if (settings) {
      const budget = (settings as any)?.monthly_budget ?? 0;
      setBudgetValue(String(budget));
    }
  }, [settings]);

  const saveBudget = useCallback(async (value: number) => {
    if (!userId) return;
    
    setIsSavingBudget(true);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ user_id: userId, monthly_budget: value })
        .eq('user_id', userId);

      if (error) throw error;
      
      toast({
        title: "Budget salvato con successo",
      });
    } catch (err: any) {
      toast({
        title: "Errore nel salvataggio",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsSavingBudget(false);
    }
  }, [userId, toast]);

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    // Allow empty or valid number input
    if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
      setBudgetValue(inputValue);
      
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Parse and validate
      const numValue = parseFloat(inputValue) || 0;
      if (numValue < 0) return;
      
      // Debounced save
      debounceTimerRef.current = setTimeout(() => {
        saveBudget(numValue);
      }, 400);
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
    });
  }, []);

  const [formData, setFormData] = useState({
    amount: '',
    category: 'food',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Errore",
        description: "L'importo deve essere maggiore di zero",
        variant: "destructive"
      });
      return;
    }
    
    if (!formData.category) {
      toast({
        title: "Errore", 
        description: "Seleziona una categoria",
        variant: "destructive"
      });
      return;
    }
    
    // Convert local date to UTC
    const localDate = new Date(formData.date + 'T00:00:00');
    const utcDate = localDate.toISOString().split('T')[0];
    
    await addExpense.mutateAsync({
      amount,
      category: formData.category,
      description: formData.description,
      date: utcDate,
    });
    setFormData({
      amount: '',
      category: 'food',
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    setShowAddForm(false);
  };


  const filteredExpenses = Array.isArray(expenses) ? expenses : [];
  
  // Calculate current month expenses only
  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    return filteredExpenses.filter(exp => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
    });
  }, [filteredExpenses]);

  const categoryData = useMemo(() => {
    const grouped = currentMonthExpenses.reduce((acc, exp) => {
      const cat = exp.category || 'other';
      acc[cat] = (acc[cat] || 0) + parseFloat(String(exp.amount));
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: parseFloat(value.toFixed(2))
    }));
  }, [currentMonthExpenses]);

  const totalExpenses = currentMonthExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount)), 0);
  const monthlyBudget = parseFloat(budgetValue) || 0;
  const remaining = monthlyBudget - totalExpenses;
  const budgetProgress = monthlyBudget > 0 ? (totalExpenses / monthlyBudget) * 100 : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="container mx-auto px-6 py-12 max-w-screen-xl">
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">{t('expenses.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-6 py-8 max-w-screen-xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{t('expenses.title')}</h1>
            <p className="text-muted-foreground">Gestisci le tue spese</p>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('expenses.addExpense')}</span>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Totale Spese</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{totalExpenses.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Budget Mensile</CardTitle>
                {isSavingBudget && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Salvataggio...
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold">€</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={budgetValue}
                  onChange={handleBudgetChange}
                  className="text-2xl font-bold h-auto p-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 w-28"
                  placeholder="0"
                />
              </div>
            </CardContent>
          </Card>

          <Card className={`border-border/50 shadow-sm ${remaining < 0 ? 'border-destructive/50' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rimanente</CardTitle>
                <TrendingDown className={`h-4 w-4 ${remaining < 0 ? 'text-destructive' : 'text-success'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
                €{remaining.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50">
              <CardTitle>Spese Recenti</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {filteredExpenses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessuna spesa</p>
              ) : (
                <div className="space-y-3">
                  {filteredExpenses.slice(0, 10).map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{expense.description || 'Nessuna descrizione'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(expense.date + 'T00:00:00').toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: '2-digit', 
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">€{parseFloat(String(expense.amount)).toFixed(2)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteExpense.mutate(expense.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="border-b border-border/50">
              <CardTitle>Per Categoria</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {categoryData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nessun dato</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.addExpense')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Importo (€) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                min="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">Cibo</SelectItem>
                  <SelectItem value="transport">Trasporti</SelectItem>
                  <SelectItem value="entertainment">Intrattenimento</SelectItem>
                  <SelectItem value="shopping">Shopping</SelectItem>
                  <SelectItem value="health">Salute</SelectItem>
                  <SelectItem value="bills">Bollette</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Note</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Salva</Button>
              <Button type="button" variant="outline" onClick={() => setShowAddForm(false)} className="flex-1">
                Annulla
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </main>
  );
}
