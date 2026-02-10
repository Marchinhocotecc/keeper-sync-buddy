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
// NOTE: buildSystemPrompt and callOpenRouterAI kept for cancel+continuation LLM fallback
import { buildSystemPrompt, callOpenRouterAI } from "./llm.ts";
import { analyzeMessage, AnalyzedItem, AnalyzeResult } from "./analyzeCore.ts";

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
// ANALYZE → VALIDATE → EXECUTE HELPERS
// ============================================================================

function validateAnalyzedItem(item: AnalyzedItem): { item: AnalyzedItem; valid: boolean; missingFields: string[] } {
  const missing: string[] = [];
  
  switch (item.type) {
    case 'task':
    case 'reminder':
    case 'note':
      if (!item.title || item.title.trim().length < 2 || isForbiddenTitle(item.title)) {
        missing.push('title');
      }
      break;
    case 'event':
      if (!item.title || item.title.trim().length < 2 || isForbiddenTitle(item.title)) {
        missing.push('title');
      }
      if (!item.date) missing.push('date');
      if (!item.time) missing.push('time');
      break;
    case 'expense':
      if (item.amount === null || item.amount === undefined || item.amount <= 0) {
        missing.push('amount');
      }
      break;
    case 'question':
    case 'reflection':
      // These are always "valid" - they just need a reply
      break;
    default:
      if (!item.title || item.title.trim().length < 2) {
        missing.push('title');
      }
  }
  
  return { item, valid: missing.length === 0, missingFields: missing };
}

function analyzedItemToAction(item: AnalyzedItem): { type: string; payload: any; confirmMessage: string } | null {
  const title = item.title ? normalizeTitle(item.title) : null;
  
  switch (item.type) {
    case 'task':
    case 'reminder':
    case 'note':
      if (!title) return null;
      return {
        type: 'CREATE_TASK',
        payload: { title, due_date: item.date || undefined },
        confirmMessage: item.date
          ? `Creo task "${title}" per ${formatDateIT(item.date)}?`
          : `Creo "${title}"?`
      };
    case 'event':
      if (!title || !item.date || !item.time) return null;
      const start_at = buildISODateTime(item.date, item.time);
      return {
        type: 'CREATE_EVENT',
        payload: { title, start_at },
        confirmMessage: `Creo "${title}" per ${formatDateIT(item.date)} alle ${item.time}?`
      };
    case 'expense':
      if (!item.amount || item.amount <= 0) return null;
      // Use description or title for category if available
      const category = item.title?.toLowerCase() || 'altro';
      return {
        type: 'RECORD_EXPENSE',
        payload: { amount: item.amount, category },
        confirmMessage: `Registro €${item.amount.toFixed(2)} in ${category}?`
      };
    case 'question':
    case 'reflection':
      // Not actionable
      return null;
    default:
      return null;
  }
}

function buildMissingFieldQuestion(item: AnalyzedItem, missingFields: string[], language: string): string {
  const title = item.title ? `"${normalizeTitle(item.title)}"` : '';
  
  if (missingFields.includes('title')) {
    switch (item.type) {
      case 'task': case 'reminder': return 'Che task vuoi creare?';
      case 'event': return 'Che evento vuoi creare?';
      case 'expense': return 'Che spesa vuoi registrare?';
      default: return 'Cosa vuoi fare?';
    }
  }
  
  if (missingFields.includes('date') && missingFields.includes('time')) {
    return `Quando ${title}?`;
  }
  if (missingFields.includes('date')) {
    return `Che giorno ${title}?`;
  }
  if (missingFields.includes('time')) {
    return `A che ora ${title}?`;
  }
  if (missingFields.includes('amount')) {
    return 'Quanto hai speso?';
  }
  
  return 'Puoi darmi più dettagli?';
}

function handleQueryIntent(intent: string, context: any): Partial<AIResponse> {
  if (intent === "QUERY_TASKS") {
    const pending = context.todos.filter((t: any) => !t.completed);
    if (pending.length === 0) return { intent: "QUERY_TASKS", reply: "Non hai task 🎉" };
    const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n");
    return { intent: "QUERY_TASKS", reply: `📋 Task:\n${list}` };
  }
  if (intent === "QUERY_EVENTS") {
    if (context.events.length === 0) return { intent: "QUERY_EVENTS", reply: "Non hai eventi 📅" };
    const list = context.events.map((e: any, i: number) => {
      const d = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
      return `${i + 1}. ${e.title} — ${d}`;
    }).join("\n");
    return { intent: "QUERY_EVENTS", reply: `📅 Eventi:\n${list}` };
  }
  if (intent === "QUERY_BUDGET") {
    const total = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const budget = context.budget?.amount || 0;
    return { intent: "QUERY_BUDGET", reply: `💰 Spese: €${total.toFixed(2)} / €${budget}` };
  }
  return { intent: "NONE" as AIIntent, reply: "Come posso aiutarti?" };
}

const TRANSLATED_REPLIES: Record<string, Record<string, string>> = {
  it: { howCanIHelp: "Come posso aiutarti?", showTasks: "Mostra task", addEvent: "Aggiungi evento", showExpenses: "Mostra spese" },
  en: { howCanIHelp: "How can I help you?", showTasks: "Show tasks", addEvent: "Add event", showExpenses: "Show expenses" },
  es: { howCanIHelp: "¿Cómo puedo ayudarte?", showTasks: "Mostrar tareas", addEvent: "Agregar evento", showExpenses: "Mostrar gastos" }
};

function getTranslatedReply(lang: string, key: string): string {
  return TRANSLATED_REPLIES[lang]?.[key] || TRANSLATED_REPLIES["it"][key] || key;
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
          
          // === MULTI-INTENT EXECUTION ===
          if (actionTypeStr === "MULTI") {
            const intentsToExecute = pendingAction.payload?.intents || [];
            const results: string[] = [];
            let successCount = 0;
            
            for (const intentData of intentsToExecute) {
              const singleActionType = intentData.type.replace("CONFIRM_", "");
              const actionObj: AIAction = {
                type: singleActionType as any,
                ...intentData.payload
              };
              
              try {
                const result = await executeAction(supabase, userId, actionObj);
                if (result.success) {
                  successCount++;
                  results.push(`✅ ${result.message}`);
                } else {
                  results.push(`❌ ${result.message}`);
                }
              } catch (e) {
                results.push(`❌ Errore: ${intentData.payload?.title || 'azione'}`);
              }
            }
            
            await setPendingAction(supabase, userId, null);
            await clearAssistantState(supabase, userId);
            
            return jsonResponse(createResponse({
              intent: "CREATE_TASK",
              reply: `Eseguite ${successCount}/${intentsToExecute.length} azioni:\n${results.join("\n")}`,
              mode: "OPERATIVE"
            }));
          }
          
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
    
    // === SLOT FILLING (only for active conversations awaiting data) ===
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
    
    // ================================================================
    // === NEW PIPELINE: ANALYZE → VALIDATE → EXECUTE → RESPOND ===
    // ================================================================
    
    // --- PHASE 1: ANALYZE (LLM #1 - pure semantic analysis → JSON) ---
    console.log("[AI-FREE] === PHASE 1: ANALYZE ===");
    const analysis: AnalyzeResult = await analyzeMessage(message);
    console.log("ANALYZE OUTPUT", JSON.stringify(analysis, null, 2));
    
    // If analyze failed completely or returned no items, use deterministic router as full fallback
    if (!analysis.items || analysis.items.length === 0) {
      const analysisFailed = analysis.uncertainties?.some(u => u.includes("API error") || u.includes("timeout"));
      console.log(`[AI-FREE] Analyze returned 0 items, analysisFailed=${analysisFailed}`);
      
      const routerResult = deterministicRouter(message, state);
      if (routerResult.matched) {
        // Greetings / small talk / advice
        if (routerResult.intent === "SMALL_TALK" || routerResult.intent === "ADVICE") {
          return jsonResponse(createResponse({
            intent: routerResult.intent,
            reply: routerResult.reply!,
            suggestions: routerResult.suggestions
          }));
        }
        // Queries
        if (routerResult.intent === "QUERY_TASKS" || routerResult.intent === "QUERY_EVENTS" || routerResult.intent === "QUERY_BUDGET") {
          const context = await fetchUserContext(supabase, userId);
          return jsonResponse(createResponse(handleQueryIntent(routerResult.intent, context)));
        }
        // When analyze failed, also use deterministic router for creation intents
        if (analysisFailed && routerResult.action && routerResult.action.type !== "NONE") {
          console.log(`[AI-FREE] Using deterministic fallback for creation: ${routerResult.intent}`);
          if (routerResult.needsConfirmation || (routerResult.missingFields && routerResult.missingFields.length > 0)) {
            if (routerResult.intent && routerResult.intent !== "NONE") {
              const newPayload: any = { expectedInput: routerResult.missingFields?.[0]?.toUpperCase() };
              if (routerResult.action?.title) newPayload.title = routerResult.action.title;
              await updateAssistantState(supabase, userId, {
                active_intent: routerResult.intent,
                intent_payload: newPayload
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
          return jsonResponse(createResponse({
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
      
      // No items and no deterministic match → conversational reply
      return jsonResponse(createResponse({
        intent: "SMALL_TALK",
        reply: analysis.summary || getTranslatedReply(userLang.code, "howCanIHelp"),
        suggestions: [
          getTranslatedReply(userLang.code, "showTasks"),
          getTranslatedReply(userLang.code, "addEvent"),
          getTranslatedReply(userLang.code, "showExpenses")
        ]
      }));
    }
    
    // --- PHASE 2: VALIDATE (code, no AI) ---
    console.log("[AI-FREE] === PHASE 2: VALIDATE ===");
    const validatedItems: Array<{ item: AnalyzedItem; valid: boolean; missingFields: string[] }> = [];
    
    for (const item of analysis.items) {
      const validation = validateAnalyzedItem(item);
      validatedItems.push(validation);
      console.log(`[AI-FREE] Validate: type=${item.type}, title=${item.title}, valid=${validation.valid}, missing=${validation.missingFields.join(',')}`);
    }
    
    // Check if any items have missing fields
    const invalidItems = validatedItems.filter(v => !v.valid);
    const validItems = validatedItems.filter(v => v.valid);
    
    // If ALL items are invalid (missing data), ask for clarification
    if (validItems.length === 0 && invalidItems.length > 0) {
      const firstInvalid = invalidItems[0];
      const missingStr = firstInvalid.missingFields.join(', ');
      
      // Set state for slot filling
      const intentMap: Record<string, string> = {
        'task': 'CREATE_TASK', 'event': 'CREATE_EVENT', 'expense': 'RECORD_EXPENSE',
        'reminder': 'CREATE_TASK', 'note': 'CREATE_TASK'
      };
      const activeIntent = intentMap[firstInvalid.item.type] || 'NONE';
      
      const payload: any = {};
      if (firstInvalid.item.title) payload.title = firstInvalid.item.title;
      if (firstInvalid.item.date) payload.date = firstInvalid.item.date;
      if (firstInvalid.item.time) payload.time = firstInvalid.item.time;
      
      await updateAssistantState(supabase, userId, {
        active_intent: activeIntent,
        intent_payload: payload
      });
      
      const pendingType = activeIntent === 'CREATE_TASK' ? 'AWAIT_TASK_TITLE' : 'AWAIT_EVENT_DETAILS';
      await setPendingAction(supabase, userId, {
        type: pendingType,
        payload,
        question: buildMissingFieldQuestion(firstInvalid.item, firstInvalid.missingFields, analysis.language)
      });
      
      return jsonResponse(createResponse({
        intent: activeIntent as AIIntent,
        reply: buildMissingFieldQuestion(firstInvalid.item, firstInvalid.missingFields, analysis.language),
        needsConfirmation: true,
        confirmationQuestion: buildMissingFieldQuestion(firstInvalid.item, firstInvalid.missingFields, analysis.language),
        missingFields: firstInvalid.missingFields
      }));
    }
    
    // --- PHASE 3: EXECUTE (via confirmation) ---
    console.log("[AI-FREE] === PHASE 3: PREPARE EXECUTION ===");
    
    // Convert validated items to actions
    const actionsToConfirm: Array<{ type: string; payload: any; confirmMessage: string }> = [];
    
    for (const v of validItems) {
      const action = analyzedItemToAction(v.item);
      if (action) {
        actionsToConfirm.push(action);
      }
    }
    
    if (actionsToConfirm.length === 0) {
      return jsonResponse(createResponse({
        intent: "SMALL_TALK",
        reply: analysis.summary || getTranslatedReply(userLang.code, "howCanIHelp")
      }));
    }
    
    // --- PHASE 4: RESPOND (template, no LLM) ---
    console.log("[AI-FREE] === PHASE 4: RESPOND ===");
    
    if (actionsToConfirm.length === 1) {
      // Single action → standard confirmation
      const single = actionsToConfirm[0];
      
      // Premium check
      if (isPremiumOnlyAction(single.type)) {
        return jsonResponse(getPremiumBlockedMessage());
      }
      
      await setPendingAction(supabase, userId, {
        type: `CONFIRM_${single.type}`,
        payload: single.payload,
        question: single.confirmMessage
      });
      
      return jsonResponse(createResponse({
        intent: single.type as AIIntent,
        action: { type: single.type as any, ...single.payload },
        reply: single.confirmMessage,
        needsConfirmation: true,
        confirmationQuestion: single.confirmMessage
      }));
    }
    
    // Multiple actions → batch confirmation
    const confirmations: string[] = [];
    const pendingIntents: any[] = [];
    
    for (const action of actionsToConfirm) {
      if (isPremiumOnlyAction(action.type)) continue;
      confirmations.push(action.confirmMessage);
      pendingIntents.push({
        type: `CONFIRM_${action.type}`,
        payload: action.payload,
      });
    }
    
    if (pendingIntents.length > 0) {
      await setPendingAction(supabase, userId, {
        type: "CONFIRM_MULTI",
        payload: { intents: pendingIntents },
        question: confirmations.join("\n")
      });
      
      return jsonResponse(createResponse({
        intent: "CREATE_TASK",
        reply: `Ho trovato ${pendingIntents.length} azioni:\n${confirmations.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nConfermi tutto?`,
        needsConfirmation: true,
        confirmationQuestion: "Confermi tutto?",
        mode: "OPERATIVE"
      }));
    }
    
    return jsonResponse(createResponse({
      intent: "SMALL_TALK",
      reply: getTranslatedReply(userLang.code, "howCanIHelp")
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
