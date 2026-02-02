/**
 * AI Free Chat - Edge Function
 * Modular architecture: types, parser, state, router, executor, llm
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

// Import modules
import { 
  AIResponse, 
  AIAction, 
  AIIntent,
  CORS_HEADERS,
  PREMIUM_ONLY_ACTIONS 
} from "./types.ts";
import { 
  normalizeTitle, 
  isForbiddenTitle,
  parseDateTime,
  isPureTime,
  buildISODateTime,
  formatDateIT 
} from "./parser.ts";
import { 
  getAssistantState, 
  updateAssistantState, 
  clearAssistantState,
  getPendingAction,
  setPendingAction,
  fetchUserContext,
  loadPreferredLanguage
} from "./state.ts";
import { 
  deterministicRouter, 
  handleSlotFilling,
  detectCancelWithContinuation,
  isAdviceRequest,
  isConfirm
} from "./router.ts";
import { executeAction } from "./executor.ts";
import { buildSystemPrompt, callOpenRouterAI } from "./llm.ts";

// ============================================================================
// RESPONSE HELPERS
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

function jsonResponse(data: AIResponse): Response {
  console.log(`[AI-FREE] Response: intent=${data.intent}, mode=${data.mode}, action=${data.action.type}, missing=${data.missingFields.join(',')}`);
  return new Response(
    JSON.stringify(data),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

function isPremiumOnlyAction(actionType: string): boolean {
  return PREMIUM_ONLY_ACTIONS.includes(actionType);
}

function getPremiumBlockedMessage(): AIResponse {
  return createResponse({
    intent: "NONE",
    reply: "⭐ Questa funzione (bulk delete) è disponibile nel piano Premium. Per ora puoi eliminare uno alla volta.",
    suggestions: ["Mostra task", "Mostra eventi"]
  });
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
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Messaggio richiesto" })),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }
    
    if (!userId) {
      userId = body.userId || null;
    }
    
    if (!userId) {
      return new Response(
        JSON.stringify(createResponse({ intent: "ERROR", reply: "Autenticazione richiesta." })),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const message = userMessage.trim();
    console.log(`[AI-FREE] User: ${userId}, Message: "${message.substring(0, 100)}"`);
    
    // Load user's preferred language
    const userLang = await loadPreferredLanguage(supabase, userId, locale);
    console.log(`[AI-FREE] User language: ${userLang.code} (${userLang.name})`);
    
    // Get current state for slot filling
    const state = await getAssistantState(supabase, userId);
    console.log(`[AI-FREE] Current state: active_intent=${state.active_intent}`);
    
    // === UI ACTIONS (bypass all routing) ===
    if (message.startsWith("__UI_ACTION__:")) {
      const action = message.replace("__UI_ACTION__:", "");
      const context = await fetchUserContext(supabase, userId);
      
      switch (action) {
        case "SHOW_TASKS": {
          const pending = context.todos.filter((t: any) => !t.completed);
          if (pending.length === 0) {
            return jsonResponse(createResponse({ 
              intent: "QUERY_TASKS", 
              reply: "Non hai task 🎉" 
            }));
          }
          const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
          return jsonResponse(createResponse({ 
            intent: "QUERY_TASKS", 
            reply: `📋 Task:\n${list}`,
            suggestions: ["Completa uno", "Aggiungi task"]
          }));
        }
        
        case "SHOW_EVENTS": {
          if (context.events.length === 0) {
            return jsonResponse(createResponse({ 
              intent: "QUERY_EVENTS", 
              reply: "Non hai eventi 📅" 
            }));
          }
          const list = context.events.map((e: any, i: number) => {
            const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
            return `${i + 1}. ${e.title} — ${d}`;
          }).join("\n");
          return jsonResponse(createResponse({ 
            intent: "QUERY_EVENTS", 
            reply: `📅 Eventi:\n${list}` 
          }));
        }
        
        case "SHOW_EXPENSES": {
          const total = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
          const budget = context.budget?.amount || 0;
          return jsonResponse(createResponse({ 
            intent: "QUERY_BUDGET", 
            reply: `💰 Spese: €${total.toFixed(2)} / €${budget}` 
          }));
        }
        
        case "ADD_TASK":
          await updateAssistantState(supabase, userId, {
            active_intent: 'CREATE_TASK',
            intent_payload: { expectedInput: 'TASK_TITLE' }
          });
          return jsonResponse(createResponse({ 
            intent: "CREATE_TASK", 
            reply: "Cosa?",
            needsConfirmation: true,
            confirmationQuestion: "Cosa?",
            missingFields: ["title"]
          }));
        
        default:
          return jsonResponse(createResponse({ reply: "Comando non riconosciuto." }));
      }
    }
    
    // === CANCEL + CONTINUATION HANDLING ===
    const cancelResult = detectCancelWithContinuation(message);
    if (cancelResult.isCancel) {
      console.log(`[AI-FREE] Cancel detected, continuation: ${cancelResult.continuation}`);
      
      await clearAssistantState(supabase, userId);
      await setPendingAction(supabase, userId, null);
      
      if (cancelResult.continuation) {
        console.log(`[AI-FREE] Processing continuation: "${cancelResult.continuation}"`);
        
        if (isAdviceRequest(cancelResult.continuation)) {
          return jsonResponse(createResponse({
            intent: "ADVICE",
            reply: "Potresti: controllare i tuoi task, pianificare un nuovo evento, o registrare una spesa. Cosa preferisci?",
            suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
          }));
        }
        
        const contRouterResult = deterministicRouter(cancelResult.continuation, { active_intent: 'NONE' });
        if (contRouterResult.matched) {
          if (contRouterResult.intent === "SMALL_TALK" || contRouterResult.intent === "ADVICE") {
            return jsonResponse(createResponse({
              intent: contRouterResult.intent,
              reply: contRouterResult.reply!,
              suggestions: contRouterResult.suggestions
            }));
          }
          if (contRouterResult.needsConfirmation || (contRouterResult.missingFields && contRouterResult.missingFields.length > 0)) {
            if (contRouterResult.intent && contRouterResult.intent !== "NONE") {
              const newPayload: any = { expectedInput: contRouterResult.missingFields?.[0]?.toUpperCase() };
              if (contRouterResult.action?.title) newPayload.title = contRouterResult.action.title;
              await updateAssistantState(supabase, userId, {
                active_intent: contRouterResult.intent,
                intent_payload: newPayload
              });
            }
          }
          return jsonResponse(createResponse({
            intent: contRouterResult.intent || "NONE",
            action: contRouterResult.action || { type: "NONE" },
            reply: contRouterResult.reply!,
            needsConfirmation: contRouterResult.needsConfirmation || false,
            confirmationQuestion: contRouterResult.confirmationQuestion || null,
            missingFields: contRouterResult.missingFields || [],
            suggestions: contRouterResult.suggestions
          }));
        }
        
        const context = await fetchUserContext(supabase, userId);
        const systemPrompt = buildSystemPrompt(context, userLang);
        const aiResponse = await callOpenRouterAI(systemPrompt, cancelResult.continuation, userLang.code);
        return jsonResponse(createResponse({
          intent: aiResponse.intent,
          action: aiResponse.action || { type: "NONE" },
          reply: aiResponse.reply,
          needsConfirmation: aiResponse.needsConfirmation || false,
          confirmationQuestion: aiResponse.confirmationQuestion || null,
          missingFields: aiResponse.missingFields || []
        }));
      }
      
      return jsonResponse(createResponse({ 
        intent: "CANCEL", 
        reply: "Ok, annullato." 
      }));
    }
    
    // === ADVICE GUARDRAIL ===
    if (isAdviceRequest(message)) {
      console.log("[AI-FREE] Advice request detected - clearing state");
      if (state.active_intent && state.active_intent !== 'NONE') {
        await clearAssistantState(supabase, userId);
        await setPendingAction(supabase, userId, null);
      }
      
      return jsonResponse(createResponse({
        intent: "ADVICE",
        reply: "Potresti: controllare i tuoi task, pianificare un nuovo evento, o registrare una spesa. Cosa preferisci?",
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      }));
    }
    
    // === PENDING ACTION HANDLING ===
    const pendingAction = await getPendingAction(supabase, userId);
    
    if (pendingAction) {
      console.log(`[AI-FREE] Pending: ${pendingAction.type}`);
      
      if (pendingAction.type.startsWith("CONFIRM_")) {
        if (isConfirm(message)) {
          const actionTypeStr = pendingAction.type.replace("CONFIRM_", "");
          
          // Premium check
          if (isPremiumOnlyAction(actionTypeStr)) {
            await setPendingAction(supabase, userId, null);
            await clearAssistantState(supabase, userId);
            return jsonResponse(getPremiumBlockedMessage());
          }
          
          const actionObj: AIAction = {
            type: actionTypeStr as any,
            ...pendingAction.payload
          };
          const result = await executeAction(supabase, userId, actionObj);
          await setPendingAction(supabase, userId, null);
          await clearAssistantState(supabase, userId);
          
          return jsonResponse(createResponse({
            intent: actionTypeStr as AIIntent,
            action: result.success ? actionObj : { type: "NONE" },
            reply: result.message
          }));
        } else {
          await setPendingAction(supabase, userId, null);
          await clearAssistantState(supabase, userId);
          return jsonResponse(createResponse({ 
            intent: "CANCEL", 
            reply: "Ok, annullato." 
          }));
        }
      }
      
      // Awaiting task title
      if (pendingAction.type === "AWAIT_TASK_TITLE") {
        const title = normalizeTitle(message);
        if (isForbiddenTitle(title)) {
          return jsonResponse(createResponse({ 
            intent: "CREATE_TASK", 
            reply: "Titolo più specifico?",
            needsConfirmation: true,
            confirmationQuestion: "Cosa?",
            missingFields: ["title"]
          }));
        }
        
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_TASK",
          payload: { title },
          question: `Creo "${title}"?`
        });
        return jsonResponse(createResponse({
          intent: "CREATE_TASK",
          action: { type: "CREATE_TASK", title },
          reply: `Creo "${title}"?`,
          needsConfirmation: true,
          confirmationQuestion: `Creo "${title}"?`
        }));
      }
      
      // Awaiting event details
      if (pendingAction.type === "AWAIT_EVENT_DETAILS" || pendingAction.type === "AWAIT_EVENT_TIME") {
        const existingPayload = pendingAction.payload || {};
        const title = existingPayload.title;
        const existingDate = existingPayload.date;
        
        const pureTime = isPureTime(message);
        if (pureTime && title && existingDate) {
          const start_at = buildISODateTime(existingDate, pureTime);
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT",
            payload: { title, start_at },
            question: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            action: { type: "CREATE_EVENT", title, start_at },
            reply: `Creo "${title}" per ${formatDateIT(existingDate)} alle ${pureTime}?`,
            needsConfirmation: true,
            confirmationQuestion: `Confermi?`
          }));
        }
        
        const { date, time } = parseDateTime(message);
        
        if ((date || existingDate) && (time || pureTime)) {
          const finalDate = date || existingDate;
          const finalTime = time || pureTime;
          const start_at = buildISODateTime(finalDate, finalTime!);
          
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_EVENT",
            payload: { title, start_at },
            question: `Creo "${title}" per ${formatDateIT(finalDate)} alle ${finalTime}?`
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            action: { type: "CREATE_EVENT", title, start_at },
            reply: `Creo "${title}" per ${formatDateIT(finalDate)} alle ${finalTime}?`,
            needsConfirmation: true,
            confirmationQuestion: `Confermi?`
          }));
        }
        
        if (date && !time && !pureTime) {
          await setPendingAction(supabase, userId, {
            type: "AWAIT_EVENT_TIME",
            payload: { ...existingPayload, date },
            question: "A che ora?"
          });
          return jsonResponse(createResponse({
            intent: "CREATE_EVENT",
            reply: "A che ora?",
            needsConfirmation: true,
            confirmationQuestion: "A che ora?",
            missingFields: ["time"]
          }));
        }
        
        return jsonResponse(createResponse({
          intent: "CREATE_EVENT",
          reply: "Quando?",
          needsConfirmation: true,
          confirmationQuestion: "Quando?",
          missingFields: existingDate ? ["time"] : ["date", "time"]
        }));
      }
    }
    
    // === SLOT FILLING ===
    if (state.active_intent && state.active_intent !== 'NONE') {
      const slotResult = handleSlotFilling(message, state);
      if (slotResult && slotResult.matched) {
        console.log(`[AI-FREE] Slot filled: intent=${slotResult.intent}`);
        
        if (slotResult.action && slotResult.action.type !== 'NONE') {
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${slotResult.action.type}`,
            payload: slotResult.action,
            question: slotResult.confirmationQuestion || ""
          });
        } else if (slotResult.missingFields && slotResult.missingFields.length > 0) {
          const newPayload = { ...state.intent_payload };
          if (slotResult.action?.title) newPayload.title = slotResult.action.title;
          
          const { date, time } = parseDateTime(message);
          if (date) newPayload.date = date;
          if (time) newPayload.time = time;
          
          await updateAssistantState(supabase, userId, {
            intent_payload: { ...newPayload, pendingAction: state.intent_payload.pendingAction }
          });
        }
        
        return jsonResponse(createResponse({
          intent: slotResult.intent || "NONE",
          action: slotResult.action || { type: "NONE" },
          reply: slotResult.reply || "Continua...",
          needsConfirmation: slotResult.needsConfirmation || false,
          confirmationQuestion: slotResult.confirmationQuestion || null,
          missingFields: slotResult.missingFields || []
        }));
      }
    }
    
    // === DETERMINISTIC ROUTER ===
    const routerResult = deterministicRouter(message, state);
    
    if (routerResult.matched) {
      console.log(`[AI-FREE] Router matched: intent=${routerResult.intent}`);
      
      // Handle queries directly
      if (routerResult.intent === "QUERY_TASKS") {
        const context = await fetchUserContext(supabase, userId);
        const pending = context.todos.filter((t: any) => !t.completed);
        if (pending.length === 0) {
          return jsonResponse(createResponse({ intent: "QUERY_TASKS", reply: "Non hai task 🎉" }));
        }
        const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
        return jsonResponse(createResponse({ intent: "QUERY_TASKS", reply: `📋 Task:\n${list}` }));
      }
      
      if (routerResult.intent === "QUERY_EVENTS") {
        const context = await fetchUserContext(supabase, userId);
        if (context.events.length === 0) {
          return jsonResponse(createResponse({ intent: "QUERY_EVENTS", reply: "Non hai eventi 📅" }));
        }
        const list = context.events.map((e: any, i: number) => {
          const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
          return `${i + 1}. ${e.title} — ${d}`;
        }).join("\n");
        return jsonResponse(createResponse({ intent: "QUERY_EVENTS", reply: `📅 Eventi:\n${list}` }));
      }
      
      if (routerResult.intent === "QUERY_BUDGET") {
        const context = await fetchUserContext(supabase, userId);
        const total = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
        const budget = context.budget?.amount || 0;
        return jsonResponse(createResponse({ intent: "QUERY_BUDGET", reply: `💰 Spese: €${total.toFixed(2)} / €${budget}` }));
      }
      
      // Handle greetings/small talk/advice
      if (routerResult.intent === "SMALL_TALK" || routerResult.intent === "ADVICE") {
        return jsonResponse(createResponse({
          intent: routerResult.intent,
          reply: routerResult.reply!,
          suggestions: routerResult.suggestions
        }));
      }
      
      // Handle actions that need confirmation or have missing fields
      if (routerResult.needsConfirmation || (routerResult.missingFields && routerResult.missingFields.length > 0)) {
        if (routerResult.intent && routerResult.intent !== "NONE") {
          const newPayload: any = { expectedInput: routerResult.missingFields?.[0]?.toUpperCase() };
          if (routerResult.action?.title) newPayload.title = routerResult.action.title;
          if (routerResult.action?.start_at) newPayload.start_at = routerResult.action.start_at;
          
          const { date, time } = parseDateTime(message);
          if (date) newPayload.date = date;
          if (time) newPayload.time = time;
          
          await updateAssistantState(supabase, userId, {
            active_intent: routerResult.intent,
            intent_payload: newPayload
          });
        }
        
        // Set pending action for confirmation if action is complete
        if (routerResult.action && routerResult.action.type !== "NONE" && 
            (!routerResult.missingFields || routerResult.missingFields.length === 0)) {
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${routerResult.action.type}`,
            payload: routerResult.action,
            question: routerResult.confirmationQuestion || ""
          });
        } else if (routerResult.missingFields && routerResult.missingFields.length > 0) {
          const pendingType = routerResult.intent === "CREATE_TASK" ? "AWAIT_TASK_TITLE" : "AWAIT_EVENT_DETAILS";
          await setPendingAction(supabase, userId, {
            type: pendingType,
            payload: routerResult.action || {},
            question: routerResult.confirmationQuestion || routerResult.reply || ""
          });
        }
        
        return jsonResponse(createResponse({
          intent: routerResult.intent || "NONE",
          action: routerResult.action || { type: "NONE" },
          reply: routerResult.reply!,
          needsConfirmation: true,
          confirmationQuestion: routerResult.confirmationQuestion || null,
          missingFields: routerResult.missingFields || [],
          suggestions: routerResult.suggestions
        }));
      }
    }
    
    // === LLM FALLBACK ===
    console.log("[AI-FREE] Using LLM fallback");
    const context = await fetchUserContext(supabase, userId);
    const systemPrompt = buildSystemPrompt(context, userLang);
    const aiResponse = await callOpenRouterAI(systemPrompt, message, userLang.code);
    
    if (aiResponse.intent === "ERROR") {
      return jsonResponse(createResponse({
        intent: "ERROR",
        reply: aiResponse.reply,
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      }));
    }
    
    // If LLM suggests a write action with complete data
    const writeIntents = ["CREATE_TASK", "CREATE_EVENT", "RECORD_EXPENSE"];
    if (writeIntents.includes(aiResponse.intent) && aiResponse.action?.type !== "NONE") {
      if (aiResponse.action.type === "CREATE_TASK" && aiResponse.action.title) {
        const title = normalizeTitle(aiResponse.action.title);
        if (!isForbiddenTitle(title)) {
          await setPendingAction(supabase, userId, {
            type: "CONFIRM_CREATE_TASK",
            payload: { ...aiResponse.action, title },
            question: aiResponse.confirmationQuestion || `Creo "${title}"?`
          });
        }
      } else if (aiResponse.action.type === "CREATE_EVENT" && aiResponse.action.start_at) {
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_EVENT",
          payload: aiResponse.action,
          question: aiResponse.confirmationQuestion || "Confermi?"
        });
      } else if (aiResponse.action.type === "RECORD_EXPENSE" && aiResponse.action.amount) {
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_RECORD_EXPENSE",
          payload: aiResponse.action,
          question: aiResponse.confirmationQuestion || "Registro?"
        });
      }
    } else if (aiResponse.missingFields && aiResponse.missingFields.length > 0 && writeIntents.includes(aiResponse.intent)) {
      await updateAssistantState(supabase, userId, {
        active_intent: aiResponse.intent,
        intent_payload: { 
          expectedInput: aiResponse.missingFields[0]?.toUpperCase(),
          ...aiResponse.action
        }
      });
      
      const pendingType = aiResponse.intent === "CREATE_TASK" ? "AWAIT_TASK_TITLE" : "AWAIT_EVENT_DETAILS";
      await setPendingAction(supabase, userId, {
        type: pendingType,
        payload: aiResponse.action || {},
        question: aiResponse.confirmationQuestion || ""
      });
    }
    
    return jsonResponse(createResponse({
      intent: aiResponse.intent,
      action: aiResponse.action || { type: "NONE" },
      reply: aiResponse.reply,
      needsConfirmation: aiResponse.needsConfirmation || false,
      confirmationQuestion: aiResponse.confirmationQuestion || null,
      missingFields: aiResponse.missingFields || []
    }));

  } catch (error) {
    console.error("[AI-FREE] Error:", error);
    
    return new Response(
      JSON.stringify(createResponse({
        intent: "ERROR",
        reply: "Si è verificato un problema. Riprova.",
        suggestions: ["Mostra task", "Aggiungi evento", "Mostra spese"]
      })),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
