/**
 * Layer 6: Financial Insight Card — Proactive UI Component
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertTriangle, ShieldAlert, TrendingUp, ChevronDown, ChevronUp, X } from "lucide-react";
import { trackActionClicked } from "@/services/actionTracker";
import type { FinancialInsight } from "@/hooks/useFinancialInsights";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  insight: FinancialInsight;
  userId: string;
  onActionClick?: (action: { type: string; title: string }) => void;
  onDismiss?: () => void;
}

export function FinancialInsightCard({ insight, userId, onActionClick, onDismiss }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const riskConfig = {
    safe: { icon: ShieldCheck, label: t('insight.safe'), bg: "bg-success/10", border: "border-success/30", text: "text-success", dot: "bg-success" },
    warning: { icon: AlertTriangle, label: t('insight.warning'), bg: "bg-warning/10", border: "border-warning/30", text: "text-warning", dot: "bg-warning" },
    critical: { icon: ShieldAlert, label: t('insight.critical'), bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive", dot: "bg-destructive" },
  };

  const config = riskConfig[insight.riskLevel];
  const Icon = config.icon;

  if (dismissed) return null;

  const handleDismiss = () => { setDismissed(true); onDismiss?.(); };
  const handleActionClick = async (action: { type: string; title: string; actionId?: string }) => {
    if (action.actionId) await trackActionClicked(userId, action.actionId);
    onActionClick?.(action);
  };

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
      <Card className={`${config.bg} border ${config.border} overflow-hidden`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className={`p-2 rounded-xl ${config.bg}`}><Icon className={`h-5 w-5 ${config.text}`} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${config.dot} animate-pulse`} />
                  <span className={`text-xs font-medium uppercase tracking-wide ${config.text}`}>{config.label}</span>
                </div>
                <p className="text-sm font-medium text-foreground leading-snug">{insight.summary}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {(insight.insights.length > 0 || insight.actions.length > 0) && (
            <div className="mt-3">
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? t('insight.lessDetails') : t('insight.moreDetails')}
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    {insight.insights.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {insight.insights.map((text, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground">{text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {insight.quarterlyProjection && (
                      <div className="mt-3 p-2.5 rounded-lg bg-muted/50 border border-border/50">
                        <p className="text-xs text-muted-foreground">📊 {insight.quarterlyProjection}</p>
                      </div>
                    )}
                    {insight.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {insight.actions.map((action, i) => (
                          <Button key={i} size="sm" variant={action.priority === "high" ? "default" : "outline"} className="text-xs h-8" onClick={() => handleActionClick(action)}>
                            {action.title}
                          </Button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
