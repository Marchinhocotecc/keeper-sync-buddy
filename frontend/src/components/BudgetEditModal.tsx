import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';

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
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('expenses.editBudget')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="budget" className="text-[13px] font-medium">{t('expenses.budgetLabel')}</Label>
          <Input
            id="budget"
            type="text"
            inputMode="decimal"
            value={budgetValue}
            onChange={handleBudgetChange}
            placeholder="0.00"
            className={`h-12 text-[16px] rounded-xl ${error ? 'border-destructive' : ''}`}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="note" className="text-[13px] font-medium">{t('expenses.budgetNoteLabel')}</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('expenses.budgetNotePlaceholder')}
            rows={3}
            maxLength={200}
            className="rounded-xl resize-none"
          />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="flex-1 h-12 rounded-xl"
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            className="flex-1 h-12 rounded-xl font-semibold"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
