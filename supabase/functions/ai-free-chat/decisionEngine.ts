/**
 * MODULE 2 — DECISION ENGINE
 * Activated ONLY for FINANCIAL_DECISION and FINANCIAL_QUERY intents.
 * Receives pre-calculated signals, returns structured JSON.
 * NO conversation, NO empathy — pure rational analysis.
 * 
 * v2: ALWAYS proposes at least 1 micro-action. Never says just "continua così".
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
  const topCategory = signals.topCategory || 'N/A';
  const topCategoryPct = signals.topCategoryPct || 0;
  const dailySafe = Math.round(signals.dailySafeLimit || 0);

  let summary: string;
  let reasoning: string;
  const actions: DecisionAction[] = [];

  if (riskLevel === 'critical') {
    summary = `Situazione critica: speso €${Math.round(signals.totalSpent)} su €${Math.round(signals.budget)}. Limite giornaliero: €${dailySafe}.`;
    reasoning = `Burn rate al ${burnPct}%, proiezione fine mese €${Math.round(signals.projectedEndBalance)}.`;
    actions.push({
      type: 'reduce_daily_spending',
      title: `Limite €${dailySafe}/giorno`,
      description: `Riduci le spese giornaliere a massimo €${dailySafe} per rientrare nel budget.`
    });
    if (topCategory !== 'N/A') {
      actions.push({
        type: 'limit_category',
        title: `Taglia ${topCategory}`,
        description: `${topCategory} è la categoria dominante. Prova a dimezzarla questa settimana.`
      });
    }
  } else if (riskLevel === 'warning') {
    summary = `Attenzione: burn rate al ${burnPct}%. Restano €${remaining}.`;
    reasoning = `Spesa in linea ma tendenza in aumento. Categoria principale: ${topCategory}.`;
    actions.push({
      type: 'limit_category',
      title: `Rivedi ${topCategory}`,
      description: `La categoria ${topCategory} è quella con più spesa. Prova a ridurla del 20% questa settimana.`
    });
    actions.push({
      type: 'save_more',
      title: `Obiettivo: 1 giorno senza spese extra`,
      description: `Prova a non spendere in ${topCategory} per un giorno intero.`
    });
  } else {
    // SAFE — but NEVER just "continua così"
    summary = `Budget sotto controllo: usato ${burnPct}%, restano €${remaining}.`;
    reasoning = `Spesa regolare, nessun segnale di rischio critico.`;

    // Always propose a useful micro-action even when safe
    if (burnPct > 50) {
      actions.push({
        type: 'save_more',
        title: `Risparmia €${Math.round(remaining * 0.1)}`,
        description: `Sei a metà budget. Prova a mettere da parte €${Math.round(remaining * 0.1)} entro fine mese.`
      });
    } else if (topCategoryPct > 40) {
      actions.push({
        type: 'limit_category',
        title: `Monitora ${topCategory}`,
        description: `${topCategory} rappresenta il ${topCategoryPct}% delle spese. Tieni d'occhio questa categoria.`
      });
    } else if (dailySafe > 0) {
      actions.push({
        type: 'save_more',
        title: `Budget giornaliero: €${dailySafe}`,
        description: `Hai €${dailySafe} al giorno disponibili. Prova a stare sotto €${Math.round(dailySafe * 0.8)} per creare un margine.`
      });
    } else {
      actions.push({
        type: 'review_budget',
        title: 'Rivedi obiettivi',
        description: 'Stai andando bene. È un buon momento per impostare un obiettivo di risparmio.'
      });
    }
  }

  return { summary, reasoning, actions };
}

const DECISION_PROMPT = `Sei il motore decisionale finanziario di Ayvro.

Ricevi segnali già calcolati.
Non ricalcolare numeri.
Non fare conversazione.
Non scrivere testo lungo.

Il tuo compito:
- Interpretare il livello di rischio
- Generare un riassunto sintetico
- Proporre massimo 2 azioni operative concrete

REGOLE CRITICHE:
- Se burnRate > 0.5 → suggerisci micro ottimizzazione
- Se categoria dominante > 40% → suggerisci riduzione specifica
- Se rischio safe → dai 1 azione leggera (NON zero azioni)
- NON rispondere MAI solo "continua così" — proponi SEMPRE almeno 1 micro-azione utile

Rispondi SOLO in JSON valido:

{
  "summary": "frase sintetica chiara",
  "reasoning": "spiegazione breve basata sui segnali ricevuti",
  "actions": [
    {
      "type": "limit_category | reduce_daily_spending | review_budget | save_more | none",
      "title": "titolo breve",
      "description": "azione concreta e specifica"
    }
  ]
}

Se non servono azioni critiche, usa comunque 1 azione di tipo "save_more" o "review_budget".
Non aggiungere testo fuori dal JSON.`;

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

  const financialData = `Domanda utente: "${userMessage}"
Lingua: ${userLang}

Segnali pre-calcolati:
- Budget: €${signals.budget || 0}, Speso: €${Math.round(signals.totalSpent || 0)}
- Burn rate: ${Math.round((signals.burnRate || 0) * 100)}%
- Limite giornaliero sicuro: €${Math.round(signals.dailySafeLimit || 0)}
- Giorni rimanenti: ${signals.daysRemaining || 0}
- Proiezione fine mese: €${Math.round(signals.projectedEndBalance || 0)}
- Categoria dominante: ${signals.topCategory || 'N/A'} (${signals.topCategoryPct || 0}%)
- Giorni impulsivi: ${signals.impulseCount || 0}
- Livello rischio: ${risk?.riskLevel || 'unknown'} (flags: ${(risk?.flags || []).join(', ') || 'nessuno'})
- Progresso temporale: ${Math.round((signals.timeProgress || 0) * 100)}%

Rispondi in ${userLang}.`;

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
        // Post-validation: ensure at least 1 real action
        if (validated.actions.length === 0 || validated.actions.every(a => a.type === 'none')) {
          console.log("[DECISION-ENGINE] LLM returned no real actions, adding fallback micro-action");
          validated.actions = [{
            type: 'review_budget',
            title: 'Rivedi obiettivi',
            description: 'Verifica se il tuo budget attuale riflette le tue priorità reali.'
          }];
        }
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
