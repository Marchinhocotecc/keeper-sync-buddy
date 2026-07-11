/**
 * Groq API client — single source of truth for all LLM calls.
 *
 * Design principles (deliberate simplicity to avoid EarlyDrop):
 * - Fixed model: `llama-3.3-70b-versatile` only. No fallback chain.
 * - Single try/catch. No retries, no model iteration.
 * - Fails FAST with a clear Error so callers can use their own fallback
 *   (deterministic text or a user-facing error message).
 * - No env var lookup for model — hardcoded on purpose so ops mistakes
 *   in Supabase secrets don't break the function.
 */

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20000;

export interface GroqOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * Call Groq's chat/completions endpoint with the fixed model.
 * Returns the raw text content stripped of <think> tags and trimmed.
 * Throws on: missing API key, HTTP error, timeout, empty response.
 */
export async function callGroq(opts: GroqOptions): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        max_tokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Groq HTTP ${response.status}: ${errBody.substring(0, 300)}`);
    }

    const data = await response.json();
    let content = (data?.choices?.[0]?.message?.content || "").trim();
    // Strip chain-of-thought tags if the model emits them
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    if (!content) {
      throw new Error("Groq returned empty content");
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}
