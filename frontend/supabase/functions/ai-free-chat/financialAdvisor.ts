/**
 * Layer 3: Financial Advisor — LLM Strategic Interpretation
 * Receives pre-calculated signals + risk + profile.
 * Produces structured FinancialAdvice validated with Zod.
 */

// Zod-like validation (inline, no external dep in Deno edge)
interface FinancialAction {
  type: "create_task" | "adjust_budget" | "set_limit";
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
}

export interface FinancialAdvice {
  summary: string;
  riskLevel: "safe" | "warning" | "critical";
  insights: string[];
  actions: FinancialAction[];
  quarterlyProjection?: string;
}

interface AdvisorInput {
  signals: {
    burnRate: number;
    projectedEndBalance: number;
    dailyAvgSpent: number;
    dailySafeLimit: number;
    topCategory: string;
    categoryBreakdown: Record<string, { spent: number; percentage: number }>;
    savingsGap: number;
    totalSpent: number;
    budget: number;
    daysRemaining: number;
    timeProgress: number;
    impulseCount: number;
  };
  risk: {
    riskLevel: "safe" | "warning" | "critical";
    flags: string[];
  };
  profile: {
    behavioralType: string;
    riskTrend: string;
    suggestionAcceptanceRate: number;
    consistencyScore: number;
  };
  projection?: {
    scenarioIfContinue: string;
    scenarioIfAdjust: string;
    trend: string;
  };
  ignoredSuggestions: string[];
  language: string;
}

const VALID_RISK_LEVELS = ["safe", "warning", "critical"];
const VALID_ACTION_TYPES = ["create_task", "adjust_budget", "set_limit"];
const VALID_PRIORITIES = ["low", "medium", "high"];

function validateAdvice(raw: any): FinancialAdvice | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.summary !== "string" || !raw.summary) return null;
  if (!VALID_RISK_LEVELS.includes(raw.riskLevel)) return null;
  if (!Array.isArray(raw.insights)) return null;
  if (!Array.isArray(raw.actions)) return null;

  const insights = raw.insights.filter((i: any) => typeof i === "string").slice(0, 3);
  const actions: FinancialAction[] = [];

  for (const a of raw.actions.slice(0, 3)) {
    if (
      a && typeof a === "object" &&
      VALID_ACTION_TYPES.includes(a.type) &&
      typeof a.title === "string" &&
      typeof a.reason === "string" &&
      VALID_PRIORITIES.includes(a.priority)
    ) {
      actions.push(a as FinancialAction);
    }
  }

  return {
    summary: raw.summary,
    riskLevel: raw.riskLevel,
    insights,
    actions,
    quarterlyProjection: typeof raw.quarterlyProjection === "string" ? raw.quarterlyProjection : undefined,
  };
}

function buildDeterministicFallback(input: AdvisorInput): FinancialAdvice {
  const { signals, risk, projection } = input;
  const { riskLevel } = risk;

  let summary: string;
  if (riskLevel === "critical") {
    summary = `Attenzione: hai speso €${Math.round(signals.totalSpent)} su €${Math.round(signals.budget)}. Proiezione fine mese: €${Math.round(signals.projectedEndBalance)}.`;
  } else if (riskLevel === "warning") {
    summary = `Stai usando il ${Math.round(signals.burnRate * 100)}% del budget. Limite giornaliero consigliato: €${Math.round(signals.dailySafeLimit)}.`;
  } else {
    summary = `Situazione finanziaria sotto controllo. Hai ancora €${Math.round(signals.budget - signals.totalSpent)} disponibili.`;
  }

  const insights: string[] = [];
  if (signals.topCategory) {
    insights.push(`Categoria principale: ${signals.topCategory}`);
  }
  if (projection?.scenarioIfContinue) {
    insights.push(projection.scenarioIfContinue);
  }

  const actions: FinancialAction[] = [];
  if (riskLevel !== "safe") {
    actions.push({
      type: "create_task",
      title: `Rivedi spese ${signals.topCategory}`,
      reason: `${signals.topCategory} è la categoria con più spesa`,
      priority: riskLevel === "critical" ? "high" : "medium",
    });
  }

  return {
    summary,
    riskLevel,
    insights,
    actions,
    quarterlyProjection: projection?.scenarioIfContinue,
  };
}

export async function getFinancialAdvice(input: AdvisorInput): Promise<FinancialAdvice> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.error("[FinancialAdvisor] No OPENROUTER_API_KEY");
    return buildDeterministicFallback(input);
  }

  const toneMap: Record<string, string> = {
    cautious: "incoraggiante e rassicurante",
    balanced: "professionale e chiaro",
    impulsive: "diretto e concreto, senza giri di parole",
    growth_oriented: "motivante e orientato alla crescita",
  };

  const tone = toneMap[input.profile.behavioralType] || "professionale";

  const systemPrompt = `Sei un consulente finanziario personale. Tono: ${tone}.
I dati sono già calcolati e validati. NON fare calcoli.
Profilo comportamentale: ${input.profile.behavioralType}.
Trend rischio ultimi mesi: ${input.profile.riskTrend}.
Tasso accettazione suggerimenti: ${Math.round(input.profile.suggestionAcceptanceRate * 100)}%.

Regole:
1. NON ripetere suggerimenti già ignorati: ${JSON.stringify(input.ignoredSuggestions)}
2. Proponi massimo 3 azioni CONCRETE
3. Rispondi SOLO con un JSON valido nel formato specificato
4. Rispondi in ${input.language}

Formato JSON richiesto:
{
  "summary": "max 2 frasi",
  "riskLevel": "${input.risk.riskLevel}",
  "insights": ["max 3 insight"],
  "actions": [{"type": "create_task|adjust_budget|set_limit", "title": "...", "reason": "...", "priority": "low|medium|high"}],
  "quarterlyProjection": "proiezione opzionale"
}`;

  const userPrompt = `Dati finanziari:
- Speso: €${Math.round(input.signals.totalSpent)} su budget €${Math.round(input.signals.budget)}
- Burn rate: ${Math.round(input.signals.burnRate * 100)}%
- Proiezione fine mese: €${Math.round(input.signals.projectedEndBalance)}
- Limite giornaliero sicuro: €${Math.round(input.signals.dailySafeLimit)}
- Giorni rimanenti: ${input.signals.daysRemaining}
- Categoria top: ${input.signals.topCategory}
- Spese impulsive: ${input.signals.impulseCount}
- Livello rischio: ${input.risk.riskLevel}
- Flag: ${input.risk.flags.join(", ") || "nessuno"}
${input.projection ? `- Scenario: ${input.projection.scenarioIfContinue}` : ""}
${input.projection ? `- Aggiustamento: ${input.projection.scenarioIfAdjust}` : ""}`;

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      console.error("[FinancialAdvisor] API error:", resp.status);
      return buildDeterministicFallback(input);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[FinancialAdvisor] No JSON in response");
      return buildDeterministicFallback(input);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = validateAdvice(parsed);

    if (!validated) {
      console.error("[FinancialAdvisor] Validation failed");
      return buildDeterministicFallback(input);
    }

    return validated;
  } catch (err) {
    console.error("[FinancialAdvisor] Error:", err);
    return buildDeterministicFallback(input);
  }
}
