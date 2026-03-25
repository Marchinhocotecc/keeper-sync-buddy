import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface BudgetEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBudget: number;
  currentNote?: string;
  onSave: (budget: number, note: string) => Promise<void>;
  isSaving: boolean;
}

export function BudgetEditModal({ open, onOpenChange, currentBudget, currentNote = '', onSave, isSaving }: BudgetEditModalProps) {
  const { t } = useTranslation();
  const [budgetValue, setBudgetValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setBudgetValue(currentBudget.toString());
      setNote(currentNote);
      setError('');
    }
  }, [open, currentBudget, currentNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const numValue = parseFloat(budgetValue);
    if (isNaN(numValue) || numValue < 0) {
      setError(t('expenses.positiveValueError'));
      return;
    }
    await onSave(numValue, note);
  };

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setBudgetValue(value);
      setError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('expenses.editBudget')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="budget">{t('expenses.budgetLabel')}</Label>
            <Input id="budget" type="text" inputMode="decimal" value={budgetValue} onChange={handleBudgetChange} placeholder="0.00" className={error ? 'border-destructive' : ''} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">{t('expenses.budgetNoteLabel')}</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('expenses.budgetNotePlaceholder')} rows={3} maxLength={200} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
