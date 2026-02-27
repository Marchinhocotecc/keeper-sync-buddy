import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, CalendarDays } from "lucide-react";
import type { WeeklySummaryData } from "@/services/weeklySummaryService";

interface Props {
  summary: WeeklySummaryData;
}

export function WeeklySummaryCard({ summary }: Props) {
  const isUp = summary.variance > 5;
  const isDown = summary.variance < -5;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Riepilogo settimanale</h3>
        </div>

        {/* Spending comparison */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-foreground">€{Math.round(summary.totalSpent)}</p>
            <p className="text-xs text-muted-foreground">questa settimana</p>
          </div>
          <div className="flex items-center gap-1">
            {isUp ? (
              <TrendingUp className="h-4 w-4 text-destructive" />
            ) : isDown ? (
              <TrendingDown className="h-4 w-4 text-success" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={`text-sm font-medium ${
              isUp ? "text-destructive" : isDown ? "text-success" : "text-muted-foreground"
            }`}>
              {summary.variance > 0 ? "+" : ""}{Math.round(summary.variance)}%
            </span>
          </div>
        </div>

        {/* Dominant category */}
        <div className="text-xs text-muted-foreground">
          Categoria principale: <span className="font-medium text-foreground">{summary.dominantCategory}</span>
        </div>

        {/* Strategic action */}
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-2.5">
          <p className="text-xs text-foreground">{summary.strategicAction}</p>
        </div>
      </CardContent>
    </Card>
  );
}
