/**
 * AI Free Chat — Edge Function Orchestrator
 * 
 * Multi-Prompt Architecture v2:
 * 1. Intent Classifier (LLM ultra-light) → route
 * 2. Decision Engine (FINANCIAL_*) → JSON analysis
 * 3. Conversational Brain (GENERAL_CHAT, PLANNING) → natural reply
 * 4. Translator (Decision → human text)
 * 5-6. Weekly/Monthly Summary LLM (proactive)
 * 7. Proactive Monitor (risk changes)
 * 
 * v2 fixes:
 * - Follow-up detection → forces Conversational Brain with memory
 * - Conversation memory (lastIntent, lastUserMessage, lastAssistantResponse)
 * - No more "Nessun task" as default fallback
 * - Proper routing for PLANNING and GENERAL_CHAT
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

import { AIResponse, AIAction, AIIntent, CORS_HEADERS, PREMIUM_ONLY_ACTIONS } from "./types.ts";
import { getFinancialAdvice } from "./financialAdvisor.ts";
import { normalizeInput } from "./normalizer.ts";
import { 
  getAssistantState, updateAssistantState, clearAssistantState,
  getPendingAction, setPendingAction, fetchUserContext, loadPreferredLanguage,
  checkRateLimit, logAIRequest
} from "./state.ts";
import { executeAction } from "./executor.ts";
import { t, defaultSuggestions, formatTaskList, formatEventList, formatBudget } from "./responder.ts";
import { deterministicRouter, handleSlotFilling } from "./router.ts";
import { parseDateTime, isPureTime, buildISODateTime, formatDateIT, normalizeTitle, isForbiddenTitle } from "./parser.ts";
import { classifyIntent, isFollowUp } from "./intentClassifier.ts";
import { runDecisionEngine } from "./decisionEngine.ts";
import { conversationalReply, translateDecision, ConversationMemory } from "./conversationalBrain.ts";

// ============================================================================
// HELPERS
// ============================================================================

function createResponse(partial: Partial<AIResponse>, structured?: any): AIResponse & { structured?: any } {
  const base: AIResponse = {
    reply: partial.reply || "Come posso aiutarti?",
    intent: partial.intent || "SMALL_TALK",
    action: partial.action || { type: "NONE" },
    needsConfirmation: partial.needsConfirmation || false,
    confirmationQuestion: partial.confirmationQuestion || null,
    missingFields: partial.missingFields || [],
    mode: "CHATTY",
    suggestions: partial.suggestions
  };
  if (base.action.type !== "NONE" || base.needsConfirmation || base.missingFields.length > 0) {
    base.mode = "OPERATIVE";
  }
  return structured ? { ...base, structured } : base;
}

function json(data: AIResponse): Response {
  console.log(`[Ayvro] → intent=${data.intent}, mode=${data.mode}, action=${data.action.type}`);
  return new Response(JSON.stringify(data), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function isPremiumOnly(type: string): boolean {
  return PREMIUM_ONLY_ACTIONS.includes(type);
}

// ============================================================================
// CONVERSATION MEMORY HELPERS
// ============================================================================

async function loadConversationMemory(supabase: any, userId: string): Promise<ConversationMemory> {
  try {
    const { data } = await supabase
      .from("assistant_state")
      .select("intent_payload")
      .eq("user_id", userId)
      .maybeSingle();
    
    const payload = data?.intent_payload || {};
    return {
      lastIntent: payload.conversationMemory?.lastIntent || undefined,
      lastUserMessage: payload.conversationMemory?.lastUserMessage || undefined,
      lastAssistantResponse: payload.conversationMemory?.lastAssistantResponse || undefined,
    };
  } catch {
    return {};
  }
}

async function saveConversationMemory(
  supabase: any, userId: string, 
  intentLabel: string, userMessage: string, assistantReply: string
): Promise<void> {
  try {
    const { data } = await supabase
      .from("assistant_state")
      .select("intent_payload")
      .eq("user_id", userId)
      .maybeSingle();
    
    const currentPayload = data?.intent_payload || {};
    
    await supabase
      .from("assistant_state")
      .upsert({
        user_id: userId,
        intent_payload: {
          ...currentPayload,
          conversationMemory: {
            lastIntent: intentLabel,
            lastUserMessage: userMessage.substring(0, 200),
            lastAssistantResponse: assistantReply.substring(0, 300),
          }
        },
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
  } catch (err) {
    console.error("[Ayvro] Failed to save conversation memory:", err);
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { userMessage, locale = "it", financialContext } = body;

    if (!userMessage || typeof userMessage !== "string") {
      return json(createResponse({ intent: "ERROR", reply: "Messaggio richiesto" }));
    }

    // === AUTH ===
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(createResponse({ intent: "ERROR", reply: "Autenticazione richiesta." }));
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json(createResponse({ intent: "ERROR", reply: "Token non valido." }));
    }

    const userId = user.id;

    const message = userMessage.trim();
    console.log(`[Ayvro] User=${userId}, Msg="${message.substring(0, 100)}"`);

    // === FINANCIAL ADVICE INTENT (bypass normal pipeline) ===
    if (message === "__FINANCIAL_ADVICE__" && body.financialContext) {
      console.log("[Ayvro] === FINANCIAL_ADVICE intent ===");
      const userLang = await loadPreferredLanguage(supabase, userId, locale);
      const ctx = body.financialContext;
      const advice = await getFinancialAdvice({
        signals: ctx.signals,
        risk: ctx.risk,
        profile: ctx.profile,
        projection: ctx.projection,
        ignoredSuggestions: ctx.ignoredSuggestions || [],
        language: userLang.name || "italiano",
      });
      return new Response(JSON.stringify({ financialAdvice: advice }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }

    // === LAYER 0: NORMALIZE ===
    const input = normalizeInput(message);
    const userLang = await loadPreferredLanguage(supabase, userId, locale);
    const state = await getAssistantState(supabase, userId);

    // --- UI ACTIONS (bypass) ---
    if (input.isUIAction && input.uiAction) {
      const context = await fetchUserContext(supabase, userId);
      switch (input.uiAction) {
        case "SHOW_TASKS":
          return json(createResponse({ intent: "QUERY_TASKS", reply: formatTaskList(context.todos) }));
        case "SHOW_EVENTS":
          return json(createResponse({ intent: "QUERY_EVENTS", reply: formatEventList(context.events) }));
        case "SHOW_EXPENSES":
          return json(createResponse({ intent: "QUERY_BUDGET", reply: formatBudget(context.expenses, context.budget) }));
        case "ADD_TASK":
          await updateAssistantState(supabase, userId, {
            active_intent: 'CREATE_TASK',
            intent_payload: { expectedInput: 'TASK_TITLE' }
          });
          return json(createResponse({
            intent: "CREATE_TASK", reply: "Cosa?",
            needsConfirmation: true, confirmationQuestion: "Cosa?",
            missingFields: ["title"]
          }));
        default:
          return json(createResponse({ reply: "Comando non riconosciuto." }));
      }
    }

    // --- CANCEL ---
    if (input.isCancel) {
      console.log(`[Ayvro] Cancel detected, continuation: ${input.cancelContinuation}`);
      await clearAssistantState(supabase, userId);
      await setPendingAction(supabase, userId, null);

      if (input.cancelContinuation) {
        const contRouter = deterministicRouter(input.cancelContinuation, { active_intent: 'NONE' });
        if (contRouter.matched) {
          return json(createResponse({
            intent: contRouter.intent || "NONE",
            action: contRouter.action || { type: "NONE" },
            reply: contRouter.reply!,
            needsConfirmation: contRouter.needsConfirmation || false,
            confirmationQuestion: contRouter.confirmationQuestion || null,
            missingFields: contRouter.missingFields || [],
            suggestions: contRouter.suggestions
          }));
        }
      } else {
        return json(createResponse({ intent: "CANCEL", reply: t(userLang.code, "cancelled") }));
      }
    }

    // --- PENDING ACTION (confirm/reject) ---
    const pendingAction = await getPendingAction(supabase, userId);

    if (pendingAction) {
      console.log(`[Ayvro] Pending: ${pendingAction.type}`);

      if (pendingAction.type.startsWith("CONFIRM_") && input.isConfirm) {
        const actionTypeStr = pendingAction.type.replace("CONFIRM_", "");

        // Multi-intent execution
        if (actionTypeStr === "MULTI") {
          const intentsToExecute = pendingAction.payload?.intents || [];
          const results: string[] = [];
          let ok = 0;
          for (const intentData of intentsToExecute) {
            const singleType = intentData.type.replace("CONFIRM_", "");
            try {
              const result = await executeAction(supabase, userId, { type: singleType, ...intentData.payload } as AIAction);
              if (result.success) { ok++; results.push(`✅ ${result.message}`); }
              else { results.push(`❌ ${result.message}`); }
            } catch { results.push(`❌ Errore`); }
          }
          await setPendingAction(supabase, userId, null);
          await clearAssistantState(supabase, userId);
          return json(createResponse({
            intent: "CREATE_TASK", reply: `Eseguite ${ok}/${intentsToExecute.length}:\n${results.join("\n")}`
          }));
        }

        // Premium check
        if (isPremiumOnly(actionTypeStr)) {
          await setPendingAction(supabase, userId, null);
          await clearAssistantState(supabase, userId);
          return json(createResponse({
            intent: "NONE",
            reply: "⭐ Questa funzione è disponibile nel piano Premium.",
            suggestions: defaultSuggestions(userLang.code)
          }));
        }

        // Single action execution
        const result = await executeAction(supabase, userId, { type: actionTypeStr, ...pendingAction.payload } as AIAction);
        await setPendingAction(supabase, userId, null);
        await clearAssistantState(supabase, userId);
        return json(createResponse({
          intent: actionTypeStr as AIIntent,
          action: result.success ? { type: actionTypeStr as any, ...pendingAction.payload } : { type: "NONE" },
          reply: result.message
        }));
      }

      // Awaiting task title
      if (pendingAction.type === "AWAIT_TASK_TITLE") {
        const title = normalizeTitle(message);
        if (isForbiddenTitle(title)) {
          return json(createResponse({
            intent: "CREATE_TASK", reply: "Titolo più specifico?",
            needsConfirmation: true, missingFields: ["title"]
          }));
        }
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_TASK", payload: { title }, question: `Creo "${title}"?`
        });
        return json(createResponse({
          intent: "CREATE_TASK", action: { type: "CREATE_TASK", title },
          reply: `Creo "${title}"?`, needsConfirmation: true, confirmationQuestion: `Creo "${title}"?`
        }));
      }

      // Awaiting event details
      if (pendingAction.type === "AWAIT_EVENT_DETAILS" || pendingAction.type === "AWAIT_EVENT_TIME") {
        const ep = pendingAction.payload || {};
        const pureTime = isPureTime(message);
        const { date, time } = parseDateTime(message);
        const finalDate = date || ep.date;
        const finalTime = time || pureTime || ep.time;
        const finalTitle = ep.title;

        if (finalTitle && finalDate && finalTime) {
          const start_at = buildISODateTime(finalDate, finalTime);
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT", payload: { title: finalTitle, start_at },
            question: `Creo "${finalTitle}" per ${formatDateIT(finalDate)} alle ${finalTime}?`
          });
          return json(createResponse({
            intent: "CREATE_EVENT",
            action: { type: "CREATE_EVENT", title: finalTitle, start_at },
            reply: `Creo "${finalTitle}" per ${formatDateIT(finalDate)} alle ${finalTime}?`,
            needsConfirmation: true
          }));
        }
        if (finalDate && !finalTime) {
          await setPendingAction(supabase, userId, {
            type: "AWAIT_EVENT_TIME", payload: { ...ep, date: finalDate }, question: "A che ora?"
          });
          return json(createResponse({
            intent: "CREATE_EVENT", reply: "A che ora?",
            needsConfirmation: true, missingFields: ["time"]
          }));
        }
        return json(createResponse({
          intent: "CREATE_EVENT", reply: "Quando?",
          needsConfirmation: true, missingFields: ep.date ? ["time"] : ["date", "time"]
        }));
      }

      // Not a confirm → cancel pending
      if (!input.isConfirm && pendingAction.type.startsWith("CONFIRM_")) {
        await setPendingAction(supabase, userId, null);
        await clearAssistantState(supabase, userId);
        return json(createResponse({ intent: "CANCEL", reply: t(userLang.code, "cancelled") }));
      }
    }

    // --- SLOT FILLING (active conversation) ---
    if (state.active_intent && state.active_intent !== 'NONE') {
      const slotResult = handleSlotFilling(message, state);
      if (slotResult && slotResult.matched) {
        console.log(`[Ayvro] Slot filled: ${slotResult.intent}`);
        if (slotResult.action && slotResult.action.type !== 'NONE') {
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${slotResult.action.type}`,
            payload: slotResult.action,
            question: slotResult.confirmationQuestion || ""
          });
        } else if (slotResult.missingFields?.length) {
          const newPayload = { ...state.intent_payload };
          if (slotResult.action?.title) newPayload.title = slotResult.action.title;
          const { date, time } = parseDateTime(message);
          if (date) newPayload.date = date;
          if (time) newPayload.time = time;
          await updateAssistantState(supabase, userId, {
            intent_payload: { ...newPayload, pendingAction: state.intent_payload?.pendingAction }
          });
        }
        return json(createResponse({
          intent: slotResult.intent || "NONE",
          action: slotResult.action || { type: "NONE" },
          reply: slotResult.reply || "Continua...",
          needsConfirmation: slotResult.needsConfirmation || false,
          confirmationQuestion: slotResult.confirmationQuestion || null,
          missingFields: slotResult.missingFields || []
        }));
      }
    }

    // NOTE: Greeting and ADVICE guardrails REMOVED.
    // All messages now flow through the LLM Intent Classifier (Module 1).
    // Greetings → GENERAL_CHAT → Conversational Brain
    // Advice requests → PLANNING/GENERAL_CHAT → Conversational Brain

    // ================================================================
    // === RATE LIMIT CHECK ===
    // ================================================================
    const rateLimit = await checkRateLimit(supabase, userId);
    if (!rateLimit.allowed) {
      console.log(`[Ayvro] Rate limit exceeded for user ${userId}`);
      return json(createResponse({
        intent: "ERROR",
        reply: `Hai raggiunto il limite giornaliero di ${rateLimit.limit} messaggi AI. Riprova domani! 🕐`,
        suggestions: ["Mostra task", "Mostra eventi", "Mostra spese"]
      }));
    }

    // ================================================================
    // === LOAD CONVERSATION MEMORY ===
    // ================================================================
    const memory = await loadConversationMemory(supabase, userId);

    // ================================================================
    // === FOLLOW-UP DETECTION (BEFORE classifier) ===
    // ================================================================
    const textToAnalyze = input.isCancel && input.cancelContinuation ? input.cancelContinuation : input.normalizedText;
    
    if (isFollowUp(textToAnalyze) && memory.lastAssistantResponse) {
      console.log("[Ayvro] === FOLLOW-UP DETECTED → CONVERSATIONAL BRAIN ===");
      await logAIRequest(supabase, userId);
      const context = await fetchUserContext(supabase, userId);
      const brainReply = await conversationalReply(textToAnalyze, userLang.code, {
        todos: context.todos,
        events: context.events,
        financialSummary: financialContext?.signals
          ? `Budget €${financialContext.signals.budget || 0}, speso €${Math.round(financialContext.signals.totalSpent || 0)}, rischio: ${financialContext.risk?.riskLevel || 'unknown'}`
          : undefined
      }, memory);

      await saveConversationMemory(supabase, userId, 'GENERAL_CHAT', message, brainReply);
      return json(createResponse({
        intent: "SMALL_TALK",
        reply: brainReply,
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // ================================================================
    // === MODULE 1: INTENT CLASSIFIER ===
    // ================================================================
    await logAIRequest(supabase, userId);
    console.log(`[Ayvro] INPUT: "${textToAnalyze.substring(0, 100)}"`);
    const intentLabel = await classifyIntent(textToAnalyze);
    console.log(`[Ayvro] INTENT: ${intentLabel}`);

    // ================================================================
    // === ROUTE BY INTENT LABEL ===
    // ================================================================

    // --- FINANCIAL_DECISION / FINANCIAL_QUERY → Decision Engine + Translator ---
    if (intentLabel === 'FINANCIAL_DECISION' || intentLabel === 'FINANCIAL_QUERY') {
      console.log("[Ayvro] ROUTED_TO: DECISION_ENGINE");
      const signals = financialContext?.signals || {};
      const risk = financialContext?.risk || { riskLevel: 'unknown', flags: [] };
      
      const decision = await runDecisionEngine(textToAnalyze, signals, risk, userLang.code);
      console.log("[Ayvro] === M4: TRANSLATOR ===");
      const naturalReply = await translateDecision(decision, userLang.code);

      await saveConversationMemory(supabase, userId, intentLabel, message, naturalReply);
      return json(createResponse(
        { intent: "ADVICE", reply: naturalReply },
        { summary: decision.summary, reasoning: decision.reasoning, actions: decision.actions }
      ));
    }

    // --- TASK_QUERY → Deterministic ---
    console.log("[Ayvro] ROUTED_TO: DB_QUERY (tasks)");
      const context = await fetchUserContext(supabase, userId);
      const reply = formatTaskList(context.todos);
      await saveConversationMemory(supabase, userId, 'TASK_QUERY', message, reply);
      return json(createResponse({ intent: "QUERY_TASKS", reply }));
    }

    // --- EVENT_QUERY → Deterministic ---
    console.log("[Ayvro] ROUTED_TO: DB_QUERY (events)");
      const context = await fetchUserContext(supabase, userId);
      const reply = formatEventList(context.events);
      await saveConversationMemory(supabase, userId, 'EVENT_QUERY', message, reply);
      return json(createResponse({ intent: "QUERY_EVENTS", reply }));
    }

    // --- PLANNING / GENERAL_CHAT → Conversational Brain ---
    if (intentLabel === 'PLANNING' || intentLabel === 'GENERAL_CHAT') {
      console.log(`[Ayvro] ROUTED_TO: CONVERSATIONAL_BRAIN (${intentLabel})`);
      const context = await fetchUserContext(supabase, userId);
      const brainReply = await conversationalReply(textToAnalyze, userLang.code, {
        todos: context.todos,
        events: context.events,
        financialSummary: financialContext?.signals
          ? `Budget €${financialContext.signals.budget || 0}, speso €${Math.round(financialContext.signals.totalSpent || 0)}, rischio: ${financialContext.risk?.riskLevel || 'unknown'}`
          : undefined
      }, memory);

      await saveConversationMemory(supabase, userId, intentLabel, message, brainReply);
      return json(createResponse({
        intent: intentLabel === 'PLANNING' ? "ADVICE" : "SMALL_TALK",
        reply: brainReply,
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // --- UNKNOWN → Try deterministic router for CREATION patterns only, then Brain ---
    console.log("[Ayvro] === UNKNOWN INTENT: trying deterministic router for creation ===");
    
    // Only use deterministic router if message looks like a creation command
    const isCreationPattern = /\b(crea|aggiungi|ricordami|devo|€|euro|\d+\s*€|nuovo|nuova|elimina|cancella|rimuovi)\b/i.test(message);
    
    if (isCreationPattern) {
      const routerResult = deterministicRouter(message, state);
      
      if (routerResult.matched) {
        // Handle creation intents from deterministic router
        if (routerResult.action && routerResult.action.type !== "NONE") {
          if (routerResult.needsConfirmation || routerResult.missingFields?.length) {
            if (routerResult.intent && routerResult.intent !== "NONE") {
              await updateAssistantState(supabase, userId, {
                active_intent: routerResult.intent,
                intent_payload: { title: routerResult.action?.title }
              });
            }
          }
          if (routerResult.action.type !== "NONE") {
            await setPendingAction(supabase, userId, {
              type: `CONFIRM_${routerResult.action.type}`,
              payload: routerResult.action,
              question: routerResult.confirmationQuestion || routerResult.reply || ""
            });
          }
          return json(createResponse({
            intent: routerResult.intent || "NONE",
            action: routerResult.action || { type: "NONE" },
            reply: routerResult.reply!,
            needsConfirmation: routerResult.needsConfirmation || false,
            confirmationQuestion: routerResult.confirmationQuestion || null,
            missingFields: routerResult.missingFields || [],
            suggestions: routerResult.suggestions
          }));
        }
        
        // Handle missing fields (incomplete creation)
        if (routerResult.missingFields?.length) {
          return json(createResponse({
            intent: routerResult.intent || "NONE",
            action: routerResult.action || { type: "NONE" },
            reply: routerResult.reply!,
            needsConfirmation: routerResult.needsConfirmation || false,
            confirmationQuestion: routerResult.confirmationQuestion || null,
            missingFields: routerResult.missingFields || [],
            suggestions: routerResult.suggestions
          }));
        }
      }
    }

    // --- UNKNOWN with no creation pattern → Conversational Brain (PRIMARY fallback) ---
    console.log("[Ayvro] === UNKNOWN → CONVERSATIONAL BRAIN (primary fallback) ===");
    {
      const context = await fetchUserContext(supabase, userId);
      const brainReply = await conversationalReply(textToAnalyze, userLang.code, {
        todos: context.todos,
        events: context.events,
        financialSummary: financialContext?.signals
          ? `Budget €${financialContext.signals.budget || 0}, speso €${Math.round(financialContext.signals.totalSpent || 0)}, rischio: ${financialContext.risk?.riskLevel || 'unknown'}`
          : undefined
      }, memory);

      await saveConversationMemory(supabase, userId, 'GENERAL_CHAT', message, brainReply);
      return json(createResponse({
        intent: "SMALL_TALK",
        reply: brainReply,
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

  } catch (error) {
    console.error("[Ayvro] Error:", error);
    return new Response(
      JSON.stringify(createResponse({
        intent: "ERROR", reply: "Si è verificato un problema. Riprova.",
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      })),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
