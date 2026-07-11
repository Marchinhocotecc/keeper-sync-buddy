/**
 * MODULE 7 — PROACTIVE MONITOR
 * Triggered when riskLevel changes.
 * Generates immediate interventions and micro-goals.
 */

export interface ProactiveAlert {
  trigger: 'risk_increase' | 'risk_decrease';
  message: string;
  micro_action: string;
}

const FALLBACK_MODELS = ["llama-3.3-70b-versatile"];

const PROACTIVE_PROMPT = `You are the proactive monitoring system.

If risk level increases:
- generate an immediate intervention
- propose a micro-goal for today

If risk level decreases:
- reinforce positive behavior
- suggest maintaining strategy

Output:

{
  "trigger": "risk_increase | risk_decrease",
  "message": "brief message",
  "micro_action": "concrete action for today"
}

JSON only.`;

function buildDeterministicAlert(
  trigger: 'risk_increase' | 'risk_decrease',
  previousLevel: string,
  currentLevel: string,
  topCategory?: string
): ProactiveAlert {
  if (trigger === 'risk_increase') {
    return {
      trigger,
      message: `Il tuo livello di rischio è passato da ${previousLevel} a ${currentLevel}. Attenzione alle spese.`,
      micro_action: topCategory
        ? `Oggi evita spese in ${topCategory}.`
        : `Oggi prova a non superare le spese essenziali.`,
    };
  }
  return {
    trigger,
    message: `Ottimo! Il rischio è sceso da ${previousLevel} a ${currentLevel}. Stai andando bene.`,
    micro_action: 'Continua con questo ritmo. Nessuna spesa extra oggi.',
  };
}

export async function generateProactiveAlert(data: {
  trigger: 'risk_increase' | 'risk_decrease';
  previousLevel: string;
  currentLevel: string;
  topCategory?: string;
  dailySafeLimit?: number;
  userLang?: string;
}): Promise<ProactiveAlert> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  const deterministic = buildDeterministicAlert(data.trigger, data.previousLevel, data.currentLevel, data.topCategory);

  if (!apiKey) {
    return deterministic;
  }

  const envModel = Deno.env.get("GROQ_MODEL");
  const modelsToTry = envModel && envModel.includes("/")
    ? [envModel, ...FALLBACK_MODELS.filter(m => m !== envModel)]
    : [...FALLBACK_MODELS];

  const userPrompt = `Language: ${data.userLang || 'it'}
Trigger: ${data.trigger}
Previous risk: ${data.previousLevel}
Current risk: ${data.currentLevel}
Top category: ${data.topCategory || 'N/A'}
Daily safe limit: €${Math.round(data.dailySafeLimit || 0)}`;

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: PROACTIVE_PROMPT },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 200,
          temperature: 0.3
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
      if (parsed.message && parsed.micro_action) {
        // console.log(`[PROACTIVE] Success (model=${model})`);
        return {
          trigger: parsed.trigger === 'risk_decrease' ? 'risk_decrease' : 'risk_increase',
          message: parsed.message,
          micro_action: parsed.micro_action,
        };
      }
      continue;
    } catch {
      continue;
    }
  }

  return deterministic;
}
