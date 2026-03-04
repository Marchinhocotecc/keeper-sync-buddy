/**
 * MODULE 2 — DECISION ENGINE
 * Activated ONLY for FINANCIAL_DECISION and FINANCIAL_QUERY intents.
 * Receives pre-calculated signals, returns structured JSON.
 * NO conversation, NO empathy — pure rational analysis.
 */

export interface DecisionAction {
  type: 'limit_category' | 'reduce_daily_spending' | 'review_budget' | 'save_more' | 'none';
  title: string;
  description: string;
}

export interface DecisionResult {
  summary: string;
  reasoning: string;
  actions: DecisionAction[];
}

const VALID_ACTION_TYPES = ['limit_category', 'reduce_daily_spending', 'review_budget', 'save_more', 'none'];

function validateDecision(raw: any): DecisionResult | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.summary !== 'string' || !raw.summary) return null;
  if (typeof raw.reasoning !== 'string') return null;
  if (!Array.isArray(raw.actions)) return null;

  const actions: DecisionAction[] = [];
  for (const a of raw.actions.slice(0, 2)) {
    if (a && typeof a === 'object' && VALID_ACTION_TYPES.includes(a.type) &&
        typeof a.title === 'string' && typeof a.description === 'string') {
      actions.push(a as DecisionAction);
    }
  }

  return { summary: raw.summary, reasoning: raw.reasoning, actions };
}

function buildDeterministicDecision(signals: any, risk: any): DecisionResult {
  const burnPct = Math.round((signals.burnRate || 0) * 100);
  const remaining = Math.round((signals.budget || 0) - (signals.totalSpent || 0));
  const riskLevel = risk?.riskLevel || 'unknown';

  let summary: string;
  let reasoning: string;
  const actions: DecisionAction[] = [];

  if (riskLevel === 'critical') {
    summary = `Situazione critica: speso €${Math.round(signals.totalSpent)} su €${Math.round(signals.budget)}. Limite giornaliero: €${Math.round(signals.dailySafeLimit)}.`;
    reasoning = `Burn rate al ${burnPct}%, proiezione fine mese €${Math.round(signals.projectedEndBalance)}.`;
    actions.push({
      type: 'reduce_daily_spending',
      title: `Limite €${Math.round(signals.dailySafeLimit)}/giorno`,
      description: `Riduci le spese giornaliere a massimo €${Math.round(signals.dailySafeLimit)} per rientrare nel budget.`
    });
  } else if (riskLevel === 'warning') {
    summary = `Attenzione: burn rate al ${burnPct}%. Restano €${remaining}.`;
    reasoning = `Spesa in linea ma tendenza in aumento. Categoria principale: ${signals.topCategory || 'N/A'}.`;
    actions.push({
      type: 'limit_category',
      title: `Rivedi ${signals.topCategory || 'spese'}`,
      description: `La categoria ${signals.topCategory || 'principale'} è quella con più spesa. Valuta se puoi ridurla.`
    });
  } else {
    summary = `Tutto sotto controllo. Budget usato al ${burnPct}%, restano €${remaining}.`;
    reasoning = `Spesa regolare, nessun segnale di rischio.`;
    actions.push({ type: 'none', title: 'Nessuna azione', description: 'Continua così.' });
  }

  return { summary, reasoning, actions };
}

const DECISION_PROMPT = `You are Ayvro's financial decision engine.

You receive pre-calculated signals. Do NOT recalculate numbers.
Do NOT make conversation. Do NOT write long text.

Your job:
- Interpret the risk level
- Generate a concise summary
- Propose max 2 concrete operational actions

Reply ONLY in valid JSON:

{
  "summary": "clear concise sentence",
  "reasoning": "brief explanation based on received signals",
  "actions": [
    {
      "type": "limit_category | reduce_daily_spending | review_budget | save_more | none",
      "title": "short title",
      "description": "concrete specific action"
    }
  ]
}

If no actions needed, use "none".
No text outside JSON.`;

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

export async function runDecisionEngine(
  userMessage: string,
  signals: any,
  risk: any,
  userLang: string = 'it'
): Promise<DecisionResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    console.log("[DECISION-ENGINE] No API key, using deterministic");
    return buildDeterministicDecision(signals, risk);
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  const financialData = `User question: "${userMessage}"
Language: ${userLang}

Pre-calculated signals:
- Budget: €${signals.budget || 0}, Spent: €${Math.round(signals.totalSpent || 0)}
- Burn rate: ${Math.round((signals.burnRate || 0) * 100)}%
- Daily safe limit: €${Math.round(signals.dailySafeLimit || 0)}
- Days remaining: ${signals.daysRemaining || 0}
- Projected end balance: €${Math.round(signals.projectedEndBalance || 0)}
- Top category: ${signals.topCategory || 'N/A'}
- Impulse days: ${signals.impulseCount || 0}
- Risk level: ${risk?.riskLevel || 'unknown'} (flags: ${(risk?.flags || []).join(', ') || 'none'})
- Time progress: ${Math.round((signals.timeProgress || 0) * 100)}%

Respond in ${userLang}.`;

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
          "X-Title": "Ayvro-DecisionEngine"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: DECISION_PROMPT },
            { role: "user", content: financialData }
          ],
          max_tokens: 500,
          temperature: 0.1
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[DECISION-ENGINE] API error ${response.status} on ${model}`);
        continue;
      }

      const data = await response.json();
      let content = (data.choices?.[0]?.message?.content || "").trim();
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      content = content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`[DECISION-ENGINE] No JSON from ${model}`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = validateDecision(parsed);

      if (validated) {
        console.log(`[DECISION-ENGINE] Success (model=${model})`);
        return validated;
      }

      console.error(`[DECISION-ENGINE] Validation failed on ${model}`);
      continue;

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[DECISION-ENGINE] Timeout on ${model}`);
      } else {
        console.error(`[DECISION-ENGINE] Error on ${model}:`, error instanceof Error ? error.message : "Unknown");
      }
      continue;
    }
  }

  console.log("[DECISION-ENGINE] All models failed, using deterministic");
  return buildDeterministicDecision(signals, risk);
}
