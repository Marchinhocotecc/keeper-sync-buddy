/**
 * MODULE 2 — DECISION ENGINE
 * Activated ONLY for FINANCIAL_DECISION and FINANCIAL_QUERY intents.
 * Receives pre-calculated signals, returns structured JSON.
 * NO conversation, NO empathy — pure rational analysis.
 * 
 * v3: Differentiates response by question type:
 * - affordability: "posso permettermi X?" → SI/NO + condition
 * - status_report: "come sto andando?" → trend + projection
 * - diagnostic: "sto spendendo troppo?" → category analysis
 */

export type DecisionType = 'affordability' | 'status_report' | 'diagnostic' | 'general';

export interface DecisionAction {
  type: 'limit_category' | 'reduce_daily_spending' | 'review_budget' | 'save_more' | 'none';
  title: string;
  description: string;
}

export interface DecisionResult {
  summary: string;
  reasoning: string;
  actions: DecisionAction[];
  decision_type?: DecisionType;
  verdict?: string; // For affordability: "si"/"no"
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

  return {
    summary: raw.summary,
    reasoning: raw.reasoning,
    actions,
    decision_type: raw.decision_type || 'general',
    verdict: raw.verdict || undefined,
  };
}

// ============================================================================
// QUESTION TYPE DETECTION
// ============================================================================

function detectDecisionType(userMessage: string): DecisionType {
  const lower = userMessage.toLowerCase();

  // Affordability: "posso permettermi", "posso spendere", "can I afford", "ce la faccio"
  if (/posso\s+(permettermi|spendere|comprare)|can\s+i\s+afford|ce\s+la\s+faccio|me\s+lo\s+posso/i.test(lower)) {
    return 'affordability';
  }

  // Diagnostic: "sto spendendo troppo", "spendo troppo", "spending too much"
  if (/spend(o|endo)\s+troppo|spending\s+too\s+much|dove\s+spendo|in\s+cosa\s+spendo|categori/i.test(lower)) {
    return 'diagnostic';
  }

  // Status report: "come sto andando", "come vanno", "situazione", "how am I doing"
  if (/come\s+(sto|vanno|va)|situazione|how\s+am\s+i|status|andamento|panoramica|riepilogo/i.test(lower)) {
    return 'status_report';
  }

  return 'general';
}

// ============================================================================
// DETERMINISTIC DECISION (differentiated by type)
// ============================================================================

function buildDeterministicDecision(userMessage: string, signals: any, risk: any): DecisionResult {
  const burnPct = Math.round((signals.burnRate || 0) * 100);
  const remaining = Math.round((signals.budget || 0) - (signals.totalSpent || 0));
  const riskLevel = risk?.riskLevel || 'unknown';
  const topCategory = signals.topCategory || 'N/A';
  const topCategoryPct = signals.topCategoryPct || 0;
  const dailySafe = Math.round(signals.dailySafeLimit || 0);
  const daysRemaining = signals.daysRemaining || 0;
  const projectedEnd = Math.round(signals.projectedEndBalance || 0);
  const decisionType = detectDecisionType(userMessage);

  switch (decisionType) {
    case 'affordability':
      return buildAffordabilityDecision(signals, risk, remaining, dailySafe, burnPct);
    case 'diagnostic':
      return buildDiagnosticDecision(signals, risk, topCategory, topCategoryPct, burnPct, remaining);
    case 'status_report':
      return buildStatusReportDecision(signals, risk, burnPct, remaining, daysRemaining, projectedEnd, topCategory);
    default:
      return buildGeneralDecision(signals, risk, burnPct, remaining, dailySafe, topCategory, topCategoryPct);
  }
}

function buildAffordabilityDecision(signals: any, risk: any, remaining: number, dailySafe: number, burnPct: number): DecisionResult {
  const riskLevel = risk?.riskLevel || 'unknown';
  const canAfford = riskLevel !== 'critical' && remaining > dailySafe;
  const verdict = canAfford ? 'si' : 'no';

  const summary = canAfford
    ? `Sì, hai margine. Ti restano €${remaining} e il tuo limite giornaliero è €${dailySafe}.`
    : `No, al momento è rischioso. Ti restano €${remaining} con burn rate al ${burnPct}%.`;

  const reasoning = canAfford
    ? `Budget sotto controllo con margine sufficiente per spese moderate.`
    : `Rischio ${riskLevel}: la spesa proiettata supera il budget disponibile.`;

  const actions: DecisionAction[] = canAfford
    ? [{
        type: 'save_more',
        title: `Max €${dailySafe}/giorno`,
        description: `Puoi spendere fino a €${dailySafe} al giorno restando in budget.`
      }]
    : [{
        type: 'reduce_daily_spending',
        title: `Riduci a €${dailySafe}/giorno`,
        description: `Per rientrare, limita le spese giornaliere a €${dailySafe}.`
      }];

  return { summary, reasoning, actions, decision_type: 'affordability', verdict };
}

function buildDiagnosticDecision(signals: any, risk: any, topCategory: string, topCategoryPct: number, burnPct: number, remaining: number): DecisionResult {
  const isTooMuch = burnPct > 70 || risk?.riskLevel === 'critical' || risk?.riskLevel === 'warning';

  const summary = isTooMuch
    ? `Sì, stai spendendo più del previsto. Burn rate al ${burnPct}%, categoria dominante: ${topCategory} (${topCategoryPct}%).`
    : `No, la spesa è nella norma. Burn rate al ${burnPct}%. ${topCategory} è la categoria principale (${topCategoryPct}%).`;

  const reasoning = isTooMuch
    ? `La categoria ${topCategory} rappresenta ${topCategoryPct}% delle spese totali. Rischio: ${risk?.riskLevel || 'unknown'}.`
    : `Spesa distribuita in modo equilibrato. Nessun segnale critico.`;

  const actions: DecisionAction[] = [];
  if (topCategoryPct > 35) {
    actions.push({
      type: 'limit_category',
      title: `Riduci ${topCategory}`,
      description: `${topCategory} è il ${topCategoryPct}% delle spese. Prova a ridurla del 20% questa settimana.`
    });
  }
  if (isTooMuch) {
    actions.push({
      type: 'reduce_daily_spending',
      title: `Obiettivo: €${Math.round(remaining / (signals.daysRemaining || 1))}/giorno`,
      description: `Per chiudere il mese in pari, limita le spese giornaliere.`
    });
  } else {
    actions.push({
      type: 'review_budget',
      title: 'Monitora le prossime spese',
      description: `Sei in linea. Tieni d'occhio ${topCategory} per mantenere il trend.`
    });
  }

  return { summary, reasoning, actions, decision_type: 'diagnostic' };
}

function buildStatusReportDecision(signals: any, risk: any, burnPct: number, remaining: number, daysRemaining: number, projectedEnd: number, topCategory: string): DecisionResult {
  const riskLevel = risk?.riskLevel || 'unknown';
  const timeProgress = Math.round((signals.timeProgress || 0) * 100);

  const summary = riskLevel === 'critical'
    ? `Situazione critica: burn rate ${burnPct}%, restano €${remaining} per ${daysRemaining} giorni. Proiezione fine mese: €${projectedEnd}.`
    : riskLevel === 'warning'
    ? `Attenzione: speso il ${burnPct}% del budget al ${timeProgress}% del mese. Restano €${remaining}.`
    : `Tutto sotto controllo: usato ${burnPct}% del budget, restano €${remaining} per ${daysRemaining} giorni.`;

  const reasoning = `Progresso temporale: ${timeProgress}%. Proiezione fine mese: €${projectedEnd}. Categoria principale: ${topCategory}. Rischio: ${riskLevel}.`;

  const actions: DecisionAction[] = [];
  if (riskLevel === 'critical') {
    actions.push({
      type: 'reduce_daily_spending',
      title: `Max €${Math.round(remaining / Math.max(daysRemaining, 1))}/giorno`,
      description: `Per non sforare, limita le spese giornaliere al minimo.`
    });
  } else if (riskLevel === 'warning') {
    actions.push({
      type: 'limit_category',
      title: `Rivedi ${topCategory}`,
      description: `${topCategory} è la voce principale. Riducila per rientrare nel trend.`
    });
  } else {
    actions.push({
      type: 'save_more',
      title: `Risparmia €${Math.round(remaining * 0.1)}`,
      description: `Sei in buona forma. Prova a mettere da parte €${Math.round(remaining * 0.1)} entro fine mese.`
    });
  }

  return { summary, reasoning, actions, decision_type: 'status_report' };
}

function buildGeneralDecision(signals: any, risk: any, burnPct: number, remaining: number, dailySafe: number, topCategory: string, topCategoryPct: number): DecisionResult {
  const riskLevel = risk?.riskLevel || 'unknown';
  const actions: DecisionAction[] = [];

  let summary: string;
  let reasoning: string;

  if (riskLevel === 'critical') {
    summary = `Situazione critica: speso €${Math.round(signals.totalSpent)} su €${Math.round(signals.budget)}. Limite giornaliero: €${dailySafe}.`;
    reasoning = `Burn rate al ${burnPct}%, proiezione fine mese €${Math.round(signals.projectedEndBalance)}.`;
    actions.push({ type: 'reduce_daily_spending', title: `Limite €${dailySafe}/giorno`, description: `Riduci le spese giornaliere a massimo €${dailySafe} per rientrare nel budget.` });
    if (topCategory !== 'N/A') {
      actions.push({ type: 'limit_category', title: `Taglia ${topCategory}`, description: `${topCategory} è la categoria dominante. Prova a dimezzarla questa settimana.` });
    }
  } else if (riskLevel === 'warning') {
    summary = `Attenzione: burn rate al ${burnPct}%. Restano €${remaining}.`;
    reasoning = `Spesa in linea ma tendenza in aumento. Categoria principale: ${topCategory}.`;
    actions.push({ type: 'limit_category', title: `Rivedi ${topCategory}`, description: `La categoria ${topCategory} è quella con più spesa. Prova a ridurla del 20% questa settimana.` });
  } else {
    summary = `Budget sotto controllo: usato ${burnPct}%, restano €${remaining}.`;
    reasoning = `Spesa regolare, nessun segnale di rischio critico.`;
    if (burnPct > 50) {
      actions.push({ type: 'save_more', title: `Risparmia €${Math.round(remaining * 0.1)}`, description: `Sei a metà budget. Prova a mettere da parte €${Math.round(remaining * 0.1)} entro fine mese.` });
    } else if (topCategoryPct > 40) {
      actions.push({ type: 'limit_category', title: `Monitora ${topCategory}`, description: `${topCategory} rappresenta il ${topCategoryPct}% delle spese. Tieni d'occhio questa categoria.` });
    } else if (dailySafe > 0) {
      actions.push({ type: 'save_more', title: `Budget giornaliero: €${dailySafe}`, description: `Hai €${dailySafe} al giorno disponibili. Prova a stare sotto €${Math.round(dailySafe * 0.8)} per creare un margine.` });
    } else {
      actions.push({ type: 'review_budget', title: 'Rivedi obiettivi', description: 'Stai andando bene. È un buon momento per impostare un obiettivo di risparmio.' });
    }
  }

  return { summary, reasoning, actions, decision_type: 'general' };
}

// ============================================================================
// DECISION PROMPT (v3: includes decision_type)
// ============================================================================

const DECISION_PROMPT = `Sei il motore decisionale finanziario di Ayvro.

Ricevi segnali già calcolati e il TIPO DI DOMANDA dell'utente.

Non ricalcolare numeri.
Non fare conversazione.
Non scrivere testo lungo.

TIPI DI DOMANDA:
- affordability: l'utente chiede "posso permettermi X?" → rispondi con verdict SI/NO + condizione
- status_report: l'utente chiede "come sto andando?" → focus su trend, proiezione, panoramica
- diagnostic: l'utente chiede "sto spendendo troppo?" → focus su categoria dominante, confronto
- general: domanda generica finanziaria → riassunto + azione

REGOLE CRITICHE:
- Adatta summary e reasoning al decision_type
- Per affordability: includi "verdict": "si" o "verdict": "no"
- Per diagnostic: evidenzia la categoria problematica
- Per status_report: includi proiezione e trend
- Proponi SEMPRE almeno 1 azione concreta
- NON rispondere MAI solo "continua così"

Rispondi SOLO in JSON valido:

{
  "decision_type": "affordability | status_report | diagnostic | general",
  "verdict": "si | no (solo per affordability, ometti per gli altri)",
  "summary": "frase sintetica chiara adattata al tipo di domanda",
  "reasoning": "spiegazione breve basata sui segnali ricevuti",
  "actions": [
    {
      "type": "limit_category | reduce_daily_spending | review_budget | save_more | none",
      "title": "titolo breve",
      "description": "azione concreta e specifica"
    }
  ]
}

Non aggiungere testo fuori dal JSON.`;

import { callGroq } from "./groqClient.ts";

export async function runDecisionEngine(
  userMessage: string,
  signals: any,
  risk: any,
  userLang: string = 'it'
): Promise<DecisionResult> {
  const decisionType = detectDecisionType(userMessage);

  const financialData = `Domanda utente: "${userMessage}"
Tipo domanda: ${decisionType}
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

  try {
    let content = await callGroq({
      systemPrompt: DECISION_PROMPT,
      userPrompt: financialData,
      maxTokens: 500,
      temperature: 0.1,
      timeoutMs: 20000,
    });
    // Strip code fences if present
    content = content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[DECISION-ENGINE] No JSON in Groq response");
      return buildDeterministicDecision(userMessage, signals, risk);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = validateDecision(parsed);
    if (!validated) {
      console.error("[DECISION-ENGINE] Validation failed");
      return buildDeterministicDecision(userMessage, signals, risk);
    }

    // Post-validation: ensure at least 1 real action
    if (validated.actions.length === 0 || validated.actions.every(a => a.type === 'none')) {
      validated.actions = [{
        type: 'review_budget',
        title: 'Rivedi obiettivi',
        description: 'Verifica se il tuo budget attuale riflette le tue priorità reali.'
      }];
    }
    return validated;
  } catch (err) {
    console.error("[DECISION-ENGINE] Groq call failed:", err instanceof Error ? err.message : err);
    return buildDeterministicDecision(userMessage, signals, risk);
  }
}
