import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BudgetCardProps {
  budget: number;
  onEditClick: () => void;
}

export function BudgetCard({ budget, onEditClick }: BudgetCardProps) {
  return (
    <Card className="app-card">
      <CardHeader className="app-card-header">
        <div className="flex items-center justify-between">
          <CardTitle className="app-card-title">Budget Mensile</CardTitle>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onEditClick}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="app-card-value">€{budget.toFixed(2)}</div>
      </CardContent>
    </Card>
  );
}
