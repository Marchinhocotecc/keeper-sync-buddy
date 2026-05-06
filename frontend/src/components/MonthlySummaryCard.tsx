import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, TrendingUp, Calendar } from "lucide-react";
import type { MonthlySummaryData } from "@/services/monthlySummaryService";

interface Props {
  summary: MonthlySummaryData;
}

const MONTH_NAMES = [
  "", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

export function MonthlySummaryCard({ summary }: Props) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {MONTH_NAMES[summary.month]} {summary.year}
          </h3>
        </div>

        {/* Budget status */}
        <div className="flex items-center gap-2">
          {summary.budgetRespected ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className={`text-sm font-medium ${
            summary.budgetRespected ? "text-success" : "text-destructive"
          }`}>
            {summary.budgetRespected ? "Budget rispettato" : "Budget superato"}
          </span>
          {summary.budget > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              €{Math.round(summary.totalSpent)} / €{Math.round(summary.budget)}
            </span>
          )}
        </div>

        {/* Peak day */}
        {summary.peakDay && (
          <div className="text-xs text-muted-foreground">
            Picco: <span className="font-medium text-foreground">€{Math.round(summary.peakDay.amount)}</span> il {summary.peakDay.date}
          </div>
        )}

        {/* Variance vs prev month */}
        {summary.previousMonthSpent > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>
              {summary.varianceVsPrevMonth > 0 ? "+" : ""}
              {Math.round(summary.varianceVsPrevMonth)}% vs mese precedente
            </span>
          </div>
        )}

        {/* Strategic action */}
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-2.5">
          <p className="text-xs text-foreground">{summary.strategicAction}</p>
        </div>
      </CardContent>
    </Card>
  );
}
