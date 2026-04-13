/**
 * MODULE 5 — WEEKLY SUMMARY ENGINE
 * Wraps deterministic data with optional LLM interpretation.
 * Called proactively (not in-chat).
 */

export interface WeeklySummaryLLMResult {
  summary: string;
  variation: string;
  dominant_category: string;
  critical_days: string;
  strategic_action: string;
}

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

const WEEKLY_PROMPT = `You are a weekly financial analyst.

You receive:
- current week spending
- previous week spending
- dominant category
- critical days
- monthly budget
- riskLevel

Generate JSON:

{
  "summary": "general state of the week",
  "variation": "increase/decrease percentage vs previous week",
  "dominant_category": "main category",
  "critical_days": "any critical days",
  "strategic_action": "one single priority action"
}

No conversation. No text outside JSON.`;

export async function generateWeeklySummary(data: {
  currentWeekSpent: number;
  previousWeekSpent: number;
  dominantCategory: string;
  criticalDays: string[];
  monthlyBudget: number;
  riskLevel: string;
  userLang?: string;
}): Promise<WeeklySummaryLLMResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  const deterministic = buildDeterministicWeekly(data);

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return deterministic;
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  const userPrompt = `Language: ${data.userLang || 'it'}
- Current week: €${Math.round(data.currentWeekSpent)}
- Previous week: €${Math.round(data.previousWeekSpent)}
- Dominant category: ${data.dominantCategory}
- Critical days: ${data.criticalDays.join(', ') || 'none'}
- Monthly budget: €${Math.round(data.monthlyBudget)}
- Risk level: ${data.riskLevel}`;

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ayvro.app",
          "X-Title": "Ayvro-WeeklySummary"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: WEEKLY_PROMPT },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 400,
          temperature: 0.2
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) continue;

      const result = await response.json();
      let content = (result.choices?.[0]?.message?.content || "").trim();
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      content = content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.summary && parsed.strategic_action) {
        // console.log(`[WEEKLY-SUMMARY] Success (model=${model})`);
        return {
          summary: parsed.summary,
          variation: parsed.variation || deterministic.variation,
          dominant_category: parsed.dominant_category || data.dominantCategory,
          critical_days: parsed.critical_days || deterministic.critical_days,
          strategic_action: parsed.strategic_action,
        };
      }
      continue;
    } catch {
      continue;
    }
  }

  return deterministic;
}

function buildDeterministicWeekly(data: any): WeeklySummaryLLMResult {
  const variation = data.previousWeekSpent > 0
    ? Math.round(((data.currentWeekSpent - data.previousWeekSpent) / data.previousWeekSpent) * 100)
    : 0;

  return {
    summary: `Spesa settimanale: €${Math.round(data.currentWeekSpent)}. ${variation > 0 ? 'In aumento' : 'In diminuzione'} rispetto alla settimana precedente.`,
    variation: `${variation > 0 ? '+' : ''}${variation}%`,
    dominant_category: data.dominantCategory,
    critical_days: data.criticalDays.length > 0 ? data.criticalDays.join(', ') : 'Nessuno',
    strategic_action: data.riskLevel === 'critical'
      ? `Riduci le spese in ${data.dominantCategory}`
      : 'Mantieni il ritmo attuale',
  };
}
