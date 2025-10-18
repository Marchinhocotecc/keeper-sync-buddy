import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, AlertCircle, Settings } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { useSettings } from '@/hooks/useSettings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658'];

export default function ExpensesPage() {
  const { t } = useTranslation();
  const [userId, setUserId] = React.useState<string | undefined>();
  const { expenses, isLoading, isError, error, addExpense, deleteExpense } = useExpenses(userId);
  const { settings, updateSettings } = useSettings(userId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
    await addExpense.mutateAsync({
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      date: formData.date,
    });
    setFormData({
      amount: '',
      category: 'food',
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    setShowAddForm(false);
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      food: '🍔',
      transport: '🚗',
      entertainment: '🎮',
      shopping: '🛒',
      bills: '📄',
      health: '🏥',
      other: '💰',
    };
    return icons[category] || '💰';
  };

  const filteredExpenses = useMemo(() => {
    if (!Array.isArray(expenses)) return [];
    let filtered = expenses;
    if (startDate) {
      filtered = filtered.filter(exp => new Date(exp.date) >= new Date(startDate));
    }
    if (endDate) {
      filtered = filtered.filter(exp => new Date(exp.date) <= new Date(endDate));
    }
    return filtered;
  }, [expenses, startDate, endDate]);

  const categoryData = useMemo(() => {
    const grouped = filteredExpenses.reduce((acc, exp) => {
      const cat = exp.category || 'other';
      acc[cat] = (acc[cat] || 0) + parseFloat(String(exp.amount));
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: parseFloat(value.toFixed(2))
    }));
  }, [filteredExpenses]);

  const periodData = useMemo(() => {
    const grouped: Record<string, number> = {};
    
    filteredExpenses.forEach(exp => {
      const date = new Date(exp.date);
      let key = '';
      
      if (period === 'weekly') {
        const week = Math.ceil(date.getDate() / 7);
        key = `Week ${week}`;
      } else if (period === 'monthly') {
        key = date.toLocaleString('default', { month: 'short' });
      } else {
        key = date.getFullYear().toString();
      }
      
      grouped[key] = (grouped[key] || 0) + parseFloat(String(exp.amount));
    });

    return Object.entries(grouped).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2))
    }));
  }, [filteredExpenses, period]);

  const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount)), 0);
  const monthlyBudget = settings?.monthly_budget || 1000;
  const remaining = monthlyBudget - totalExpenses;

  const handleBudgetUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const budget = parseFloat(budgetInput);
    if (budget > 0) {
      await updateSettings.mutateAsync({ monthly_budget: budget });
      setShowBudgetDialog(false);
      setBudgetInput('');
    }
  };

  if (isLoading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-muted-foreground">{t('expenses.loading')}</div>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : t('expenses.errorLoading')}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">{t('expenses.title')}</h1>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('expenses.addExpense')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <div>
          <Label>{t('expenses.startDate')}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>{t('expenses.endDate')}</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.totalExpenses')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">€{totalExpenses.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{t('expenses.budget')}</CardTitle>
            <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setBudgetInput(monthlyBudget.toString())}>
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Imposta Budget Mensile</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleBudgetUpdate} className="space-y-4">
                  <div>
                    <Label htmlFor="budget">Budget (€)</Label>
                    <Input
                      id="budget"
                      type="number"
                      step="0.01"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">Salva Budget</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">€{monthlyBudget.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.remaining')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${remaining < 0 ? 'text-destructive' : 'text-success'}`}>
              €{remaining.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {showAddForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('expenses.addNew')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="amount">{t('expenses.amount')}</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="category">{t('expenses.category')}</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="food">{t('expenses.food')}</SelectItem>
                      <SelectItem value="transport">{t('expenses.transport')}</SelectItem>
                      <SelectItem value="entertainment">{t('expenses.entertainment')}</SelectItem>
                      <SelectItem value="shopping">{t('expenses.shopping')}</SelectItem>
                      <SelectItem value="bills">{t('expenses.bills')}</SelectItem>
                      <SelectItem value="health">{t('expenses.health')}</SelectItem>
                      <SelectItem value="other">{t('expenses.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="description">{t('expenses.description')}</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="date">{t('expenses.date')}</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">{t('home.save')}</Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  {t('home.cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.byCategory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
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
            ) : (
              <p className="text-muted-foreground text-center py-8">{t('expenses.noData')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('expenses.overTime')}</CardTitle>
            <div className="flex gap-2">
              <Button variant={period === 'weekly' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod('weekly')}>
                {t('expenses.weekly')}
              </Button>
              <Button variant={period === 'monthly' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod('monthly')}>
                {t('expenses.monthly')}
              </Button>
              <Button variant={period === 'yearly' ? 'default' : 'outline'} size="sm" onClick={() => setPeriod('yearly')}>
                {t('expenses.yearly')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {periodData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={periodData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8">{t('expenses.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('expenses.transactions')}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredExpenses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('expenses.noExpenses')}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getCategoryIcon(expense.category)}</span>
                    <div>
                      <p className="font-medium">{expense.description || expense.category}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(expense.date).toLocaleDateString()} • {expense.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold">€{parseFloat(String(expense.amount)).toFixed(2)}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteExpense.mutate(expense.id)}
                      className="text-muted-foreground hover:text-destructive"
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
    </main>
  );
}