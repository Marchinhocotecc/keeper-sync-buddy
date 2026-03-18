/**
 * MODULE 1 — INTENT CLASSIFIER
 * Ultra-light LLM call: receives message, returns ONLY a label.
 * max_tokens: 20, temperature: 0
 * 
 * v2: Improved follow-up detection + better deterministic fallback
 */

export type IntentLabel =
  | 'FINANCIAL_DECISION'
  | 'FINANCIAL_QUERY'
  | 'TASK_QUERY'
  | 'EVENT_QUERY'
  | 'PLANNING'
  | 'GENERAL_CHAT'
  | 'UNKNOWN';

const VALID_LABELS: IntentLabel[] = [
  'FINANCIAL_DECISION', 'FINANCIAL_QUERY', 'TASK_QUERY',
  'EVENT_QUERY', 'PLANNING', 'GENERAL_CHAT', 'UNKNOWN'
];

const CLASSIFIER_PROMPT = `Sei un classificatore di intenti per un assistente personale.

Classifica il messaggio dell'utente in UNA SOLA delle seguenti categorie:

- FINANCIAL_DECISION (es: posso permettermi?, sto spendendo troppo?, quanto posso spendere oggi?)
- FINANCIAL_QUERY (es: come sto andando?, quanto ho speso?, livello di rischio?)
- TASK_QUERY (es: elenca task, cosa ho oggi?, mostra to-do)
- EVENT_QUERY (es: eventi di oggi?, cosa c'è in calendario?)
- PLANNING (es: quando mi consigli di allenarmi?, pianifica la giornata, aiutami a organizzare)
- GENERAL_CHAT (qualsiasi conversazione normale, saluti, ringraziamenti, domande astratte, follow-up come "perché?", "come mai?", "spiegami")
- UNKNOWN (non determinabile)

Rispondi SOLO con la label.
Non aggiungere testo.
Non spiegare.
Nessuna punteggiatura.`;

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "deepseek/deepseek-r1-0528:free",
];

// ============================================================================
// FOLLOW-UP DETECTION
// ============================================================================

const FOLLOW_UP_PATTERNS = [
  /^perch[eéè]\??$/i,
  /^come mai\??$/i,
  /^spiegami$/i,
  /^perch[eéè]\s+dici\s+cos[iì]\??$/i,
  /^in che senso\??$/i,
  /^cosa\s+intendi\??$/i,
  /^cio[eè]\??$/i,
  /^e\s+quindi\??$/i,
  /^ma\s+perch[eéè]\??$/i,
  /^e\s+perch[eéè]\??$/i,
  /^cosa\s+significa\??$/i,
  /^puoi\s+spiegare\??$/i,
  /^why\??$/i,
  /^what do you mean\??$/i,
  /^explain$/i,
];

export function isFollowUp(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return FOLLOW_UP_PATTERNS.some(p => p.test(lower));
}

/**
 * Deterministic fallback when LLM is unavailable
 */
function classifyDeterministic(message: string): IntentLabel {
  const lower = message.toLowerCase().trim();

  // Follow-up → always GENERAL_CHAT
  if (isFollowUp(lower)) {
    return 'GENERAL_CHAT';
  }

  // Financial decision
  if (/(?:posso permettermi|posso spendere|sto spendendo troppo|quanto posso|ce la faccio|can i afford|budget enough|me lo posso permettere)/i.test(lower)) {
    return 'FINANCIAL_DECISION';
  }

  // Financial query
  if (/(?:come sto andando|quanto ho speso|livello di rischio|situazione finanziaria|how much.*spent|burn rate|risk level|spending|spese totali|budget|come vanno le finanze)/i.test(lower)) {
    return 'FINANCIAL_QUERY';
  }

  // Task query
  if (/(?:mostra.*task|elenca.*task|lista.*task|i miei task|show.*task|cose da fare|to-?do|cosa ho da fare|cosa devo fare oggi)/i.test(lower)) {
    return 'TASK_QUERY';
  }

  // Event query
  if (/(?:mostra.*event|elenca.*event|eventi di oggi|calendar|impegni|appuntamenti|show.*event|cosa ho in agenda)/i.test(lower)) {
    return 'EVENT_QUERY';
  }

  // Planning
  if (/(?:quando.*consigli|pianifica|organizza.*giornata|plan|schedule|help me plan|quando dovrei|quando mi consigli|come organizzo|aiutami a pianificare|routine)/i.test(lower)) {
    return 'PLANNING';
  }

  // General chat (broader patterns)
  if (/(?:grazie|thanks|bravo|bene|ok grazie|perfetto|come stai|come va|buongiorno|buonasera|ciao|hey|ehi)/i.test(lower)) {
    return 'GENERAL_CHAT';
  }

  return 'UNKNOWN';
}

export async function classifyIntent(message: string): Promise<IntentLabel> {
  // Fast path: follow-ups are ALWAYS GENERAL_CHAT, skip LLM
  if (isFollowUp(message)) {
    console.log("[INTENT-CLASSIFIER] Follow-up detected, forcing GENERAL_CHAT");
    return 'GENERAL_CHAT';
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");

  if (!apiKey || !apiKey.startsWith("sk-or-")) {
    console.log("[INTENT-CLASSIFIER] No API key, using deterministic fallback");
    return classifyDeterministic(message);
  }

  const envModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ayvro.app",
          "X-Title": "Ayvro-IntentClassifier"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: CLASSIFIER_PROMPT },
            { role: "user", content: message }
          ],
          max_tokens: 20,
          temperature: 0
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[INTENT-CLASSIFIER] API error ${response.status} on model ${model}`);
        continue;
      }

      const data = await response.json();
      let content = (data.choices?.[0]?.message?.content || "").trim();
      
      // Clean think tags and whitespace
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      content = content.toUpperCase().replace(/[^A-Z_]/g, "");

      if (VALID_LABELS.includes(content as IntentLabel)) {
        console.log(`[INTENT-CLASSIFIER] Result: ${content} (model=${model})`);
        return content as IntentLabel;
      }

      // Try partial match
      const found = VALID_LABELS.find(l => content.includes(l));
      if (found) {
        console.log(`[INTENT-CLASSIFIER] Partial match: ${found} (model=${model})`);
        return found;
      }

      console.warn(`[INTENT-CLASSIFIER] Invalid label "${content}" from ${model}`);
      continue;

    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[INTENT-CLASSIFIER] Timeout on ${model}`);
      } else {
        console.error(`[INTENT-CLASSIFIER] Error on ${model}:`, error instanceof Error ? error.message : "Unknown");
      }
      continue;
    }
  }

  console.log("[INTENT-CLASSIFIER] All models failed, using deterministic");
  return classifyDeterministic(message);
}
