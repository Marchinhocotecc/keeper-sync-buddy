/**
 * AI Free Chat — Edge Function Orchestrator
 * 
 * 7-Layer Cognitive Architecture:
 * L0: Normalize (normalizer.ts)     — clean input, detect shortcuts
 * L1: Analyze (analyzeCore.ts)      — LLM semantic understanding → JSON
 * L2: Validate (validator.ts)       — check completeness
 * L3: Confirm (confirmer.ts)        — build confirmation templates
 * L4: State (state.ts)              — safe merge, persistence
 * L5: Execute (executor.ts)         — CRUD operations
 * L6: Respond (responder.ts)        — natural language output
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

import { AIResponse, AIAction, AIIntent, CORS_HEADERS, PREMIUM_ONLY_ACTIONS } from "./types.ts";
import { getFinancialAdvice } from "./financialAdvisor.ts";
import { normalizeInput } from "./normalizer.ts";
import { analyzeMessage, AnalyzeResult } from "./analyzeCore.ts";
import { validateItems, buildMissingFieldQuestion } from "./validator.ts";
import { itemToAction, buildSingleConfirmation, buildMultiConfirmation, buildMultiConfirmMessage } from "./confirmer.ts";
import { 
  getAssistantState, updateAssistantState, clearAssistantState,
  getPendingAction, setPendingAction, fetchUserContext, loadPreferredLanguage,
  checkRateLimit, logAIRequest, getCachedAnalysis, setCachedAnalysis
} from "./state.ts";
import { executeAction } from "./executor.ts";
import { randomGreeting, t, defaultSuggestions, formatTaskList, formatEventList, formatBudget } from "./responder.ts";
import { deterministicRouter, handleSlotFilling } from "./router.ts";
import { parseDateTime, isPureTime, buildISODateTime, formatDateIT, normalizeTitle, isForbiddenTitle } from "./parser.ts";

// ============================================================================
// HELPERS
// ============================================================================

function createResponse(partial: Partial<AIResponse>): AIResponse {
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
  return base;
}

function json(data: AIResponse): Response {
  console.log(`[Ayro] → intent=${data.intent}, mode=${data.mode}, action=${data.action.type}`);
  return new Response(JSON.stringify(data), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function isPremiumOnly(type: string): boolean {
  return PREMIUM_ONLY_ACTIONS.includes(type);
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
    const { userMessage, locale = "it" } = body;

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
    console.log(`[Ayro] User=${userId}, Msg="${message.substring(0, 100)}"`);

    // === FINANCIAL ADVICE INTENT (bypass normal pipeline) ===
    if (message === "__FINANCIAL_ADVICE__" && body.financialContext) {
      console.log("[Ayro] === FINANCIAL_ADVICE intent ===");
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
      console.log(`[Ayro] Cancel detected, continuation: ${input.cancelContinuation}`);
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
      console.log(`[Ayro] Pending: ${pendingAction.type}`);

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
        console.log(`[Ayro] Slot filled: ${slotResult.intent}`);
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

    // --- GREETING (skip LLM) ---
    if (input.isGreeting) {
      return json(createResponse({
        intent: "SMALL_TALK", reply: randomGreeting(),
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // --- ADVICE GUARDRAIL ---
    const isAdvice = /cosa\s+(?:posso|potrei|dovrei)\s+fare|consigliami|cosa\s+faccio|aiutami|non\s+so\s+(?:cosa|che)\s+fare|cosa puoi fare|come funzion/i.test(message);
    if (isAdvice) {
      if (state.active_intent && state.active_intent !== 'NONE') {
        await clearAssistantState(supabase, userId);
        await setPendingAction(supabase, userId, null);
      }
      return json(createResponse({
        intent: "ADVICE",
        reply: t(userLang.code, "advice") || "Posso aiutarti a gestire task, eventi e spese.",
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // ================================================================
    // === RATE LIMIT CHECK ===
    // ================================================================
    const rateLimit = await checkRateLimit(supabase, userId);
    if (!rateLimit.allowed) {
      console.log(`[Ayro] Rate limit exceeded for user ${userId}`);
      return json(createResponse({
        intent: "ERROR",
        reply: `Hai raggiunto il limite giornaliero di ${rateLimit.limit} messaggi AI. Riprova domani! 🕐`,
        suggestions: ["Mostra task", "Mostra eventi", "Mostra spese"]
      }));
    }

    // ================================================================
    // === CACHE CHECK ===
    // ================================================================
    const textToAnalyze = input.isCancel && input.cancelContinuation ? input.cancelContinuation : input.normalizedText;
    const cachedResult = await getCachedAnalysis(supabase, textToAnalyze);

    let analysis: AnalyzeResult;
    if (cachedResult) {
      console.log("[Ayro] === L1: CACHE HIT ===");
      analysis = cachedResult as AnalyzeResult;
    } else {
      // === LAYER 1: ANALYZE (LLM) ===
      await logAIRequest(supabase, userId);
      console.log("[Ayro] === L1: ANALYZE ===");
      analysis = await analyzeMessage(textToAnalyze, userLang.code);
      // Cache the result (fire-and-forget)
      if (analysis.items && analysis.items.length > 0) {
        setCachedAnalysis(supabase, userId, textToAnalyze, analysis);
      }
    }
    console.log("[Ayro] Analyze result:", JSON.stringify(analysis, null, 2));

    // If no items, fallback to deterministic router
    if (!analysis.items || analysis.items.length === 0) {
      const analysisFailed = analysis.uncertainties?.some(u => u.includes("API error"));
      const routerResult = deterministicRouter(message, state);
      
      if (routerResult.matched) {
        if (routerResult.intent === "SMALL_TALK" || routerResult.intent === "ADVICE") {
          return json(createResponse({
            intent: routerResult.intent, reply: routerResult.reply!,
            suggestions: routerResult.suggestions
          }));
        }
        if (routerResult.intent === "QUERY_TASKS" || routerResult.intent === "QUERY_EVENTS" || routerResult.intent === "QUERY_BUDGET") {
          const context = await fetchUserContext(supabase, userId);
          if (routerResult.intent === "QUERY_TASKS") return json(createResponse({ intent: "QUERY_TASKS", reply: formatTaskList(context.todos) }));
          if (routerResult.intent === "QUERY_EVENTS") return json(createResponse({ intent: "QUERY_EVENTS", reply: formatEventList(context.events) }));
          if (routerResult.intent === "QUERY_BUDGET") return json(createResponse({ intent: "QUERY_BUDGET", reply: formatBudget(context.expenses, context.budget) }));
        }
        // Creation intents from deterministic fallback (only if analyze failed)
        if (analysisFailed && routerResult.action && routerResult.action.type !== "NONE") {
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
      }

      // No items, no router match → conversational
      return json(createResponse({
        intent: "SMALL_TALK",
        reply: analysis.items?.length === 0 && !analysisFailed
          ? t(userLang.code, "howCanIHelp")
          : t(userLang.code, "howCanIHelp"),
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // Handle greeting items from analyze
    if (analysis.items.length === 1 && analysis.items[0].type === 'greeting') {
      return json(createResponse({
        intent: "SMALL_TALK", reply: randomGreeting(),
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // Handle query items
    const queryItems = analysis.items.filter(i => i.type === 'query');
    if (queryItems.length > 0 && analysis.items.every(i => i.type === 'query' || i.type === 'greeting')) {
      const context = await fetchUserContext(supabase, userId);
      const queryTitle = queryItems[0].title?.toLowerCase() || '';
      if (queryTitle.includes('task') || queryTitle.includes('to-do') || queryTitle.includes('attivit')) {
        return json(createResponse({ intent: "QUERY_TASKS", reply: formatTaskList(context.todos) }));
      }
      if (queryTitle.includes('event') || queryTitle.includes('appuntament') || queryTitle.includes('impegn')) {
        return json(createResponse({ intent: "QUERY_EVENTS", reply: formatEventList(context.events) }));
      }
      if (queryTitle.includes('spes') || queryTitle.includes('budget') || queryTitle.includes('expense')) {
        return json(createResponse({ intent: "QUERY_BUDGET", reply: formatBudget(context.expenses, context.budget) }));
      }
      return json(createResponse({ intent: "QUERY_TASKS", reply: formatTaskList(context.todos) }));
    }

    // Filter out non-actionable items for validation
    const actionableItems = analysis.items.filter(i => i.type === 'task' || i.type === 'event' || i.type === 'expense');

    // ================================================================
    // === LAYER 2: VALIDATE ===
    // ================================================================
    console.log("[Ayro] === L2: VALIDATE ===");
    const validated = validateItems(actionableItems);
    const validItems = validated.filter(v => v.valid);
    const invalidItems = validated.filter(v => !v.valid);

    // All invalid → ask for missing data
    if (validItems.length === 0 && invalidItems.length > 0) {
      const first = invalidItems[0];
      const intentMap: Record<string, string> = {
        'task': 'CREATE_TASK', 'event': 'CREATE_EVENT', 'expense': 'RECORD_EXPENSE'
      };
      const activeIntent = intentMap[first.item.type] || 'NONE';
      const payload: any = {};
      if (first.item.title) payload.title = first.item.title;
      if (first.item.date) payload.date = first.item.date;
      if (first.item.time) payload.time = first.item.time;

      await updateAssistantState(supabase, userId, { active_intent: activeIntent, intent_payload: payload });
      const pendingType = activeIntent === 'CREATE_TASK' ? 'AWAIT_TASK_TITLE' : 'AWAIT_EVENT_DETAILS';
      await setPendingAction(supabase, userId, {
        type: pendingType, payload,
        question: buildMissingFieldQuestion(first.item, first.missingFields)
      });

      return json(createResponse({
        intent: activeIntent as AIIntent,
        reply: buildMissingFieldQuestion(first.item, first.missingFields),
        needsConfirmation: true,
        missingFields: first.missingFields
      }));
    }

    // ================================================================
    // === LAYER 3: CONFIRM ===
    // ================================================================
    console.log("[Ayro] === L3: CONFIRM ===");
    const actionsToConfirm = validItems
      .map(v => itemToAction(v.item))
      .filter((a): a is NonNullable<typeof a> => a !== null);

    if (actionsToConfirm.length === 0) {
      return json(createResponse({
        intent: "SMALL_TALK", reply: t(userLang.code, "howCanIHelp"),
        suggestions: defaultSuggestions(userLang.code)
      }));
    }

    // ================================================================
    // === LAYER 6: RESPOND (with pending action set) ===
    // ================================================================
    console.log("[Ayro] === L6: RESPOND ===");

    if (actionsToConfirm.length === 1) {
      const single = actionsToConfirm[0];
      if (isPremiumOnly(single.type)) {
        return json(createResponse({
          intent: "NONE", reply: "⭐ Funzione Premium.",
          suggestions: defaultSuggestions(userLang.code)
        }));
      }
      await setPendingAction(supabase, userId, {
        type: `CONFIRM_${single.type}`, payload: single.payload, question: single.confirmMessage
      });
      return json(createResponse({
        intent: single.type as AIIntent,
        action: { type: single.type as any, ...single.payload },
        reply: single.confirmMessage,
        needsConfirmation: true,
        confirmationQuestion: single.confirmMessage
      }));
    }

    // Multiple actions → batch confirmation
    const nonPremium = actionsToConfirm.filter(a => !isPremiumOnly(a.type));
    if (nonPremium.length > 0) {
      await setPendingAction(supabase, userId, {
        type: "CONFIRM_MULTI",
        payload: { intents: nonPremium.map(a => ({ type: `CONFIRM_${a.type}`, payload: a.payload })) },
        question: nonPremium.map(a => a.confirmMessage).join("\n")
      });
      return json(createResponse({
        intent: "CREATE_TASK",
        reply: buildMultiConfirmMessage(nonPremium),
        needsConfirmation: true,
        confirmationQuestion: "Confermi tutto?"
      }));
    }

    return json(createResponse({
      intent: "SMALL_TALK", reply: t(userLang.code, "howCanIHelp"),
      suggestions: defaultSuggestions(userLang.code)
    }));

  } catch (error) {
    console.error("[Ayro] Error:", error);
    return new Response(
      JSON.stringify(createResponse({
        intent: "ERROR", reply: "Si è verificato un problema. Riprova.",
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      })),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
