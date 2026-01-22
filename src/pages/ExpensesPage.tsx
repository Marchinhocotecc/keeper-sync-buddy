import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BudgetCard } from '@/components/BudgetCard';
import { BudgetEditModal } from '@/components/BudgetEditModal';
import { getMonthlyBudget, upsertMonthlyBudget } from '@/services/budgetService';

// LUMI Palette colors for charts
const COLORS = ['#6C63FF', '#A39BFF', '#5FD38A', '#F6D860', '#FF6A6A', '#4B44CC', '#8B7EFF'];

export default function ExpensesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | undefined>();
  const { expenses, isLoading, addExpense, deleteExpense } = useExpenses(userId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  
  // Budget state
  const [budget, setBudget] = useState(0);
  const [budgetNote, setBudgetNote] = useState('');

  // Current month/year for budget
  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const currentYear = new Date().getFullYear();

  // Load user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id);
    });
  }, []);

  // Load budget from budgets table when userId is available
  useEffect(() => {
    if (!userId) return;
    
    setIsLoadingBudget(true);
    getMonthlyBudget(userId, currentMonth, currentYear)
      .then((amount) => {
        setBudget(amount);
      })
      .finally(() => {
        setIsLoadingBudget(false);
      });
  }, [userId, currentMonth, currentYear]);

  const handleSaveBudget = useCallback(async (newBudget: number, note: string) => {
    if (!userId) return;
    
    setIsSavingBudget(true);
    try {
      const result = await upsertMonthlyBudget(userId, currentMonth, currentYear, newBudget);
      
      if (!result.success) {
        throw new Error(result.error || "Errore sconosciuto");
      }
      
      setBudget(newBudget);
      setBudgetNote(note);
      setShowBudgetModal(false);
      
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
  }, [userId, currentMonth, currentYear, toast]);


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
  const monthlyBudget = budget;
  const remaining = monthlyBudget - totalExpenses;

  if (isLoading || isLoadingBudget) {
    return (
      <div className="min-h-screen bg-muted/30">
        <div className="page-container">
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">{t('expenses.loading')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="page-container">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">{t('expenses.title')}</h1>
            <p className="page-subtitle">Gestisci le tue spese</p>
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
                <CardTitle className="app-card-title">Totale Spese</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="app-card-value">€{totalExpenses.toFixed(2)}</div>
            </CardContent>
          </Card>

          <BudgetCard 
            budget={budget} 
            onEditClick={() => setShowBudgetModal(true)} 
          />

          <Card className={`app-card ${remaining < 0 ? 'border-destructive/50' : ''}`}>
            <CardHeader className="app-card-header">
              <div className="flex items-center justify-between">
                <CardTitle className="app-card-title">Rimanente</CardTitle>
                <TrendingDown className={`h-4 w-4 ${remaining < 0 ? 'text-destructive' : 'text-success'}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`app-card-value ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
                €{remaining.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Card className="app-card">
            <CardHeader className="border-b border-border/50 px-4 sm:px-6 py-4">
              <CardTitle className="text-base sm:text-lg font-semibold">Spese Recenti</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {filteredExpenses.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nessuna spesa</p>
              ) : (
                <div className="space-y-2 sm:space-y-3 max-h-[400px] overflow-y-auto">
                  {filteredExpenses.slice(0, 10).map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate">{expense.description || 'Nessuna descrizione'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(expense.date + 'T00:00:00').toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: '2-digit', 
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <span className="text-sm font-semibold">€{parseFloat(String(expense.amount)).toFixed(2)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteExpense.mutate(expense.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
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

          <Card className="app-card">
            <CardHeader className="border-b border-border/50 px-4 sm:px-6 py-4">
              <CardTitle className="text-base sm:text-lg font-semibold">Per Categoria</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {categoryData.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nessun dato</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={70}
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

      {/* Budget Edit Modal */}
      <BudgetEditModal
        open={showBudgetModal}
        onOpenChange={setShowBudgetModal}
        currentBudget={budget}
        currentNote={budgetNote}
        onSave={handleSaveBudget}
        isSaving={isSavingBudget}
      />
    </main>
  );
}
