/**
 * MODULE 6 — MONTHLY SUMMARY ENGINE
 * Wraps deterministic data with optional LLM interpretation.
 * Called proactively (not in-chat).
 */

export interface MonthlySummaryLLMResult {
  summary: string;
  budget_respected: boolean;
  variation_vs_previous: string;
  main_issue: string;
  strategic_action: string;
}

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

const MONTHLY_PROMPT = `You are a monthly financial analyst.

You receive:
- total spent
- monthly budget
- variation vs previous month
- dominant category
- average risk level

Generate:

{
  "summary": "general result of the month",
  "budget_respected": true/false,
  "variation_vs_previous": "concise description",
  "main_issue": "main issue if any",
  "strategic_action": "1 concrete action for next month"
}

Max 4 blocks. No text outside JSON.`;

export async function generateMonthlySummary(data: {
  totalSpent: number;
  monthlyBudget: number;
  variationVsPrevious: number;
  dominantCategory: string;
  avgRiskLevel: string;
  userLang?: string;
}): Promise<MonthlySummaryLLMResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const deterministic = buildDeterministicMonthly(data);

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    return deterministic;
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  const userPrompt = `Language: ${data.userLang || 'it'}
- Total spent: €${Math.round(data.totalSpent)}
- Monthly budget: €${Math.round(data.monthlyBudget)}
- Variation vs previous month: ${data.variationVsPrevious > 0 ? '+' : ''}${Math.round(data.variationVsPrevious)}%
- Dominant category: ${data.dominantCategory}
- Average risk level: ${data.avgRiskLevel}`;

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
          "X-Title": "Ayvro-MonthlySummary"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: MONTHLY_PROMPT },
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
        console.log(`[MONTHLY-SUMMARY] Success (model=${model})`);
        return {
          summary: parsed.summary,
          budget_respected: typeof parsed.budget_respected === 'boolean' ? parsed.budget_respected : deterministic.budget_respected,
          variation_vs_previous: parsed.variation_vs_previous || deterministic.variation_vs_previous,
          main_issue: parsed.main_issue || deterministic.main_issue,
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

function buildDeterministicMonthly(data: any): MonthlySummaryLLMResult {
  const respected = data.totalSpent <= data.monthlyBudget;
  return {
    summary: respected
      ? `Budget rispettato: speso €${Math.round(data.totalSpent)} su €${Math.round(data.monthlyBudget)}.`
      : `Budget superato: speso €${Math.round(data.totalSpent)} su €${Math.round(data.monthlyBudget)}.`,
    budget_respected: respected,
    variation_vs_previous: `${data.variationVsPrevious > 0 ? '+' : ''}${Math.round(data.variationVsPrevious)}% rispetto al mese precedente`,
    main_issue: respected ? 'Nessun problema rilevante' : `Superamento budget di €${Math.round(data.totalSpent - data.monthlyBudget)}`,
    strategic_action: respected
      ? 'Mantieni le abitudini attuali'
      : `Riduci le spese in ${data.dominantCategory} il prossimo mese`,
  };
}
