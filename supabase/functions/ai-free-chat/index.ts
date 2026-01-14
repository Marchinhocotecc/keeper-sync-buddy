import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Forbidden titles - never create with these
const FORBIDDEN_TITLES = [
  "ok", "no", "sì", "si", "yes", "ciao", "salve", "grazie", "boh", 
  "vediamo", "pianifichiamo", "perfetto", "va bene", "top", "dai",
  "annulla", "lascia stare", "niente", "nulla", "stop"
];

// Cancel patterns
const CANCEL_PATTERNS = ["no", "annulla", "lascia stare", "stop", "niente", "cambia idea", "non importa"];

// UI Action handlers (deterministic, bypass AI)
const UI_ACTIONS: Record<string, string> = {
  "SHOW_TASKS": "QUERY_TASKS",
  "SHOW_EVENTS": "QUERY_EVENTS", 
  "SHOW_EXPENSES": "QUERY_EXPENSES",
  "ADD_TASK": "START_CREATE_TASK",
  "CREATE_EVENT": "START_CREATE_EVENT",
  "DELETE_ALL": "DELETE_ALL_CONFIRM",
  "COMPLETE_ALL_TASKS": "COMPLETE_ALL_TASKS_CONFIRM",
  "DELETE_ONE": "DELETE_ONE_START",
  "COMPLETE_ONE": "COMPLETE_ONE_START"
};

interface PendingAction {
  type: string;
  payload: any;
  question: string;
}

// Store pending confirmations (in-memory, per-request context from DB)
async function getPendingAction(supabase: any, userId: string): Promise<PendingAction | null> {
  const { data } = await supabase
    .from("assistant_state")
    .select("intent_payload")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (data?.intent_payload?.pendingAction) {
    return data.intent_payload.pendingAction as PendingAction;
  }
  return null;
}

async function setPendingAction(supabase: any, userId: string, action: PendingAction | null): Promise<void> {
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      intent_payload: { pendingAction: action },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// Normalize title
function normalizeTitle(raw: string): string {
  let title = raw.trim();
  // Remove action verbs at start
  const removePatterns = [
    /^(crea|aggiungi|nuovo|nuova|inserisci|registra|fai|fare|creare|aggiungere)\s+/i,
    /^(un|una|il|la|lo|l'|i|gli|le)\s+/i,
    /^(task|evento|spesa)\s*/i,
  ];
  for (const pattern of removePatterns) {
    title = title.replace(pattern, "");
  }
  title = title.trim();
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  return title;
}

function isForbiddenTitle(title: string): boolean {
  const lower = title.toLowerCase().trim();
  return FORBIDDEN_TITLES.includes(lower) || lower.length < 2;
}

function isCancel(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return CANCEL_PATTERNS.some(p => lower === p || lower.startsWith(p + " "));
}

function isConfirm(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return ["sì", "si", "yes", "ok", "confermo", "conferma", "va bene", "procedi"].includes(lower);
}

// Fetch user context
async function fetchUserContext(supabase: any, userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  
  const [todosRes, eventsRes, expensesRes, budgetRes, settingsRes] = await Promise.all([
    supabase.from("todos").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("calendar_events").select("*").eq("user_id", userId).gte("start_time", today).order("start_time").limit(10),
    supabase.from("expenses").select("*").eq("user_id", userId).gte("date", startOfMonth.toISOString().split("T")[0]).order("date", { ascending: false }).limit(20),
    supabase.from("budgets").select("*").eq("user_id", userId).order("year", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("settings").select("*").eq("user_id", userId).maybeSingle()
  ]);
  
  return {
    todos: todosRes.data || [],
    events: eventsRes.data || [],
    expenses: expensesRes.data || [],
    budget: budgetRes.data,
    settings: settingsRes.data
  };
}

// Execute actions
async function executeAction(supabase: any, userId: string, actionType: string, payload: any): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (actionType) {
      case "CREATE_TASK": {
        const title = normalizeTitle(payload.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido. Dimmi cosa vuoi aggiungere." };
        }
        const { data, error } = await supabase.from("todos").insert({
          user_id: userId,
          title: title,
          priority: payload.priority || "medium",
          due_date: payload.due_date || null,
          completed: false
        }).select().single();
        if (error) throw error;
        return { success: true, message: `✅ Task creato: ${title}`, data };
      }
      
      case "CREATE_EVENT": {
        const title = normalizeTitle(payload.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido. Dimmi il nome dell'evento." };
        }
        if (!payload.start_time) {
          return { success: false, message: "Mi serve la data e l'ora dell'evento." };
        }
        const { data, error } = await supabase.from("calendar_events").insert({
          user_id: userId,
          title: title,
          start_time: payload.start_time,
          end_time: payload.end_time || payload.start_time,
          category: payload.category || null,
          description: payload.description || null
        }).select().single();
        if (error) throw error;
        return { success: true, message: `✅ Evento creato: ${title}`, data };
      }
      
      case "RECORD_EXPENSE": {
        if (!payload.amount || payload.amount <= 0) {
          return { success: false, message: "Importo non valido." };
        }
        const { data, error } = await supabase.from("expenses").insert({
          user_id: userId,
          amount: payload.amount,
          category: payload.category || "altro",
          description: payload.description || null,
          date: payload.date || new Date().toISOString().split("T")[0]
        }).select().single();
        if (error) throw error;
        return { success: true, message: `✅ Spesa registrata: €${payload.amount}`, data };
      }
      
      case "DELETE_ALL_TASKS": {
        const { error } = await supabase.from("todos").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutti i task sono stati eliminati." };
      }
      
      case "DELETE_ALL_EVENTS": {
        const { error } = await supabase.from("calendar_events").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutti gli eventi sono stati eliminati." };
      }
      
      case "DELETE_ALL_EXPENSES": {
        const { error } = await supabase.from("expenses").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutte le spese sono state eliminate." };
      }
      
      case "COMPLETE_ALL_TASKS": {
        const { error } = await supabase.from("todos").update({ completed: true }).eq("user_id", userId).eq("completed", false);
        if (error) throw error;
        return { success: true, message: "✅ Tutti i task sono stati completati." };
      }
      
      case "DELETE_TASK": {
        if (!payload.id) return { success: false, message: "ID task non specificato." };
        const { error } = await supabase.from("todos").delete().eq("id", payload.id).eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Task eliminato." };
      }
      
      case "DELETE_EVENT": {
        if (!payload.id) return { success: false, message: "ID evento non specificato." };
        const { error } = await supabase.from("calendar_events").delete().eq("id", payload.id).eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Evento eliminato." };
      }
      
      case "COMPLETE_TASK": {
        if (!payload.id) return { success: false, message: "ID task non specificato." };
        const { error } = await supabase.from("todos").update({ completed: true }).eq("id", payload.id).eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Task completato." };
      }
      
      default:
        return { success: false, message: `Azione non supportata: ${actionType}` };
    }
  } catch (error) {
    console.error("Action execution error:", error);
    return { success: false, message: "Si è verificato un errore nell'esecuzione." };
  }
}

// Build system prompt
function buildSystemPrompt(context: any, locale: string): string {
  const pendingTasks = context.todos.filter((t: any) => !t.completed);
  const completedTasks = context.todos.filter((t: any) => t.completed);
  const todayEvents = context.events.slice(0, 5);
  const recentExpenses = context.expenses.slice(0, 5);
  const totalExpenses = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const budget = context.budget?.amount || 0;
  
  return `Sei un assistente personale semplice e amichevole. Rispondi in italiano in modo breve e naturale.

CONTESTO UTENTE:
- Task in sospeso: ${pendingTasks.length} (${pendingTasks.slice(0, 5).map((t: any) => t.title).join(", ") || "nessuno"})
- Task completati: ${completedTasks.length}
- Eventi prossimi: ${todayEvents.length} (${todayEvents.map((e: any) => e.title).join(", ") || "nessuno"})
- Spese del mese: €${totalExpenses.toFixed(2)} su budget €${budget}

REGOLE FONDAMENTALI:
1. Rispondi SOLO in JSON valido con questa struttura esatta:
{
  "reply": "testo da mostrare all'utente",
  "intent": "NONE|CREATE_TASK|CREATE_EVENT|RECORD_EXPENSE|QUERY_TASKS|QUERY_EVENTS|QUERY_BUDGET|DELETE_ALL_TASKS|DELETE_ALL_EVENTS|ADVICE",
  "data": {"title": "", "amount": 0, "category": "", "date": "", "time": "", "priority": ""},
  "needsConfirmation": false,
  "confirmationQuestion": null
}

2. Se l'utente chiede di CREARE qualcosa:
   - Estrai il titolo/importo dalla richiesta
   - Imposta intent appropriato e data con i dettagli
   - needsConfirmation = true
   - confirmationQuestion = "Creo [tipo]: [dettagli]?"

3. Se l'utente chiede di ELIMINARE TUTTO:
   - intent = "DELETE_ALL_TASKS" o "DELETE_ALL_EVENTS"
   - needsConfirmation = true
   - confirmationQuestion = "Sei sicuro di voler eliminare tutto?"

4. Per domande generiche, consigli, saluti:
   - intent = "NONE" o "ADVICE"
   - needsConfirmation = false
   - Rispondi in modo breve e utile

5. Per query (mostra task, eventi, spese):
   - intent = "QUERY_TASKS", "QUERY_EVENTS", "QUERY_BUDGET"
   - needsConfirmation = false
   - Elenca i dati in modo leggibile

6. MAI creare task/eventi con titoli vaghi come "ok", "no", "pianifichiamo", "sì"
7. Sii breve, umano, non tecnico
8. Se qualcosa non è chiaro, chiedi in modo semplice

Rispondi SOLO con JSON valido, nessun testo extra.`;
}

// Valid free models on OpenRouter
const VALID_FREE_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "deepseek/deepseek-chat-v3-0324:free", 
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-8b-instruct:free"
];

const DEFAULT_MODEL = "deepseek/deepseek-r1-0528:free";

// Call OpenRouter AI
async function callOpenRouterAI(systemPrompt: string, userMessage: string): Promise<any> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  
  // Get model from secret, validate it, fallback to default
  let model = Deno.env.get("OPENROUTER_MODEL") || DEFAULT_MODEL;
  
  // If model doesn't look like a valid OpenRouter model ID (contains "/"), use default
  if (!model.includes("/")) {
    console.log(`[AI-FREE] Invalid model ID "${model}", using default: ${DEFAULT_MODEL}`);
    model = DEFAULT_MODEL;
  }
  
  console.log(`[AI-FREE] Calling OpenRouter with model: ${model}`);
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lovable.dev",
      "X-Title": "Lovable Assistant"
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 1000,
      temperature: 0.7
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[AI-FREE] OpenRouter error:", response.status, errorText);
    throw new Error(`OpenRouter API error: ${response.status}`);
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  console.log("[AI-FREE] Raw AI response:", content.substring(0, 500));
  
  // Parse JSON from response (handle markdown code blocks)
  let parsed;
  try {
    // Try to extract JSON from possible markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[AI-FREE] JSON parse error, using fallback:", e);
    // Fallback response
    parsed = {
      reply: content.replace(/```json|```/g, "").trim() || "Mi dispiace, non ho capito. Puoi ripetere?",
      intent: "NONE",
      data: {},
      needsConfirmation: false,
      confirmationQuestion: null
    };
  }
  
  return parsed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userMessage, userId, locale = "it", context: clientContext } = await req.json();
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!userMessage || typeof userMessage !== "string") {
      return new Response(
        JSON.stringify({ error: "userMessage is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const message = userMessage.trim();
    console.log(`[AI-FREE] Processing message for user ${userId}: "${message}"`);
    
    // 1. Handle UI Actions (deterministic)
    if (message.startsWith("__UI_ACTION__:")) {
      const action = message.replace("__UI_ACTION__:", "");
      console.log(`[AI-FREE] UI Action: ${action}`);
      
      const context = await fetchUserContext(supabase, userId);
      
      switch (action) {
        case "SHOW_TASKS": {
          const pending = context.todos.filter((t: any) => !t.completed);
          if (pending.length === 0) {
            return new Response(JSON.stringify({
              reply: "Non hai task in sospeso 🎉",
              intent: "QUERY_TASKS",
              action: { type: "NONE", payload: {} },
              needsConfirmation: false,
              confirmationQuestion: null
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const list = pending.map((t: any, i: number) => `${i + 1}. ${t.title}${t.priority === 'high' ? ' ⚠️' : ''}`).join("\n");
          return new Response(JSON.stringify({
            reply: `📋 I tuoi task:\n${list}`,
            intent: "QUERY_TASKS",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null,
            suggestions: ["Completa uno", "Elimina uno", "Aggiungi task"]
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        case "SHOW_EVENTS": {
          if (context.events.length === 0) {
            return new Response(JSON.stringify({
              reply: "Non hai eventi in programma 📅",
              intent: "QUERY_EVENTS",
              action: { type: "NONE", payload: {} },
              needsConfirmation: false,
              confirmationQuestion: null
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const list = context.events.map((e: any, i: number) => {
            const date = new Date(e.start_time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
            return `${i + 1}. ${e.title} - ${date}`;
          }).join("\n");
          return new Response(JSON.stringify({
            reply: `📅 Prossimi eventi:\n${list}`,
            intent: "QUERY_EVENTS",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        case "SHOW_EXPENSES": {
          const total = context.expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
          const budget = context.budget?.amount || 0;
          const remaining = budget - total;
          return new Response(JSON.stringify({
            reply: `💰 Spese del mese: €${total.toFixed(2)}\nBudget: €${budget}\nRimanente: €${remaining.toFixed(2)}`,
            intent: "QUERY_BUDGET",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        case "DELETE_ALL": {
          // Ask what to delete
          await setPendingAction(supabase, userId, {
            type: "DELETE_ALL_CHOICE",
            payload: {},
            question: "Cosa vuoi eliminare? Task, eventi o spese?"
          });
          return new Response(JSON.stringify({
            reply: "Cosa vuoi eliminare? Task, eventi o spese?",
            intent: "DELETE_ALL_CONFIRM",
            action: { type: "NONE", payload: {} },
            needsConfirmation: true,
            confirmationQuestion: "Cosa vuoi eliminare? Task, eventi o spese?"
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        case "ADD_TASK": {
          await setPendingAction(supabase, userId, {
            type: "AWAIT_TASK_TITLE",
            payload: {},
            question: "Che task vuoi aggiungere?"
          });
          return new Response(JSON.stringify({
            reply: "Che task vuoi aggiungere?",
            intent: "START_CREATE_TASK",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        default:
          return new Response(JSON.stringify({
            reply: "Comando non riconosciuto.",
            intent: "NONE",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    
    // 2. Check for pending confirmation
    const pendingAction = await getPendingAction(supabase, userId);
    
    if (pendingAction) {
      console.log(`[AI-FREE] Pending action: ${pendingAction.type}`);
      
      // Handle cancel
      if (isCancel(message)) {
        await setPendingAction(supabase, userId, null);
        return new Response(JSON.stringify({
          reply: "✅ Ok, annullato. Dimmi pure cosa vuoi fare.",
          intent: "CANCEL",
          action: { type: "NONE", payload: {} },
          needsConfirmation: false,
          confirmationQuestion: null
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      // Handle confirmation for write actions
      if (pendingAction.type.startsWith("CONFIRM_")) {
        if (isConfirm(message)) {
          const actualAction = pendingAction.type.replace("CONFIRM_", "");
          const result = await executeAction(supabase, userId, actualAction, pendingAction.payload);
          await setPendingAction(supabase, userId, null);
          return new Response(JSON.stringify({
            reply: result.message,
            intent: actualAction,
            action: { type: result.success ? actualAction : "NONE", payload: pendingAction.payload },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          await setPendingAction(supabase, userId, null);
          return new Response(JSON.stringify({
            reply: "✅ Ok, annullato. Dimmi pure cosa vuoi fare.",
            intent: "CANCEL",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      
      // Handle DELETE_ALL_CHOICE
      if (pendingAction.type === "DELETE_ALL_CHOICE") {
        const lower = message.toLowerCase();
        let targetAction = "";
        if (lower.includes("task")) targetAction = "DELETE_ALL_TASKS";
        else if (lower.includes("event")) targetAction = "DELETE_ALL_EVENTS";
        else if (lower.includes("spes")) targetAction = "DELETE_ALL_EXPENSES";
        
        if (targetAction) {
          await setPendingAction(supabase, userId, {
            type: `CONFIRM_${targetAction}`,
            payload: {},
            question: `Sei sicuro di voler eliminare ${lower.includes("task") ? "tutti i task" : lower.includes("event") ? "tutti gli eventi" : "tutte le spese"}?`
          });
          return new Response(JSON.stringify({
            reply: `Sei sicuro di voler eliminare ${lower.includes("task") ? "tutti i task" : lower.includes("event") ? "tutti gli eventi" : "tutte le spese"}? (sì/no)`,
            intent: "CONFIRM",
            action: { type: "NONE", payload: {} },
            needsConfirmation: true,
            confirmationQuestion: "Confermi?"
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          await setPendingAction(supabase, userId, null);
          return new Response(JSON.stringify({
            reply: "Non ho capito cosa eliminare. Riprova specificando: task, eventi o spese.",
            intent: "NONE",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      
      // Handle AWAIT_TASK_TITLE
      if (pendingAction.type === "AWAIT_TASK_TITLE") {
        const title = normalizeTitle(message);
        if (isForbiddenTitle(title)) {
          return new Response(JSON.stringify({
            reply: "Dimmi un titolo più specifico per il task.",
            intent: "NONE",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        
        await setPendingAction(supabase, userId, {
          type: "CONFIRM_CREATE_TASK",
          payload: { title },
          question: `Creo il task "${title}"?`
        });
        return new Response(JSON.stringify({
          reply: `Creo il task "${title}"? (sì/no)`,
          intent: "CONFIRM",
          action: { type: "NONE", payload: {} },
          needsConfirmation: true,
          confirmationQuestion: `Creo il task "${title}"?`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    
    // 3. Handle simple cancel without pending action
    if (isCancel(message) && !pendingAction) {
      return new Response(JSON.stringify({
        reply: "Non c'è nulla da annullare 🙂 Dimmi cosa posso fare per te.",
        intent: "NONE",
        action: { type: "NONE", payload: {} },
        needsConfirmation: false,
        confirmationQuestion: null
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // 4. Call AI for complex messages
    const context = await fetchUserContext(supabase, userId);
    const systemPrompt = buildSystemPrompt(context, locale);
    
    const aiResponse = await callOpenRouterAI(systemPrompt, message);
    console.log(`[AI-FREE] AI response intent: ${aiResponse.intent}`);
    
    // 5. If AI suggests a write action, set up confirmation
    const writeIntents = ["CREATE_TASK", "CREATE_EVENT", "RECORD_EXPENSE", "DELETE_ALL_TASKS", "DELETE_ALL_EVENTS", "DELETE_ALL_EXPENSES"];
    
    if (writeIntents.includes(aiResponse.intent) && aiResponse.needsConfirmation) {
      // Validate data before setting pending
      if (aiResponse.intent === "CREATE_TASK" && aiResponse.data?.title) {
        const title = normalizeTitle(aiResponse.data.title);
        if (isForbiddenTitle(title)) {
          return new Response(JSON.stringify({
            reply: "Non ho capito cosa vuoi creare. Puoi essere più specifico?",
            intent: "NONE",
            action: { type: "NONE", payload: {} },
            needsConfirmation: false,
            confirmationQuestion: null
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        aiResponse.data.title = title;
      }
      
      await setPendingAction(supabase, userId, {
        type: `CONFIRM_${aiResponse.intent}`,
        payload: aiResponse.data || {},
        question: aiResponse.confirmationQuestion || "Confermi?"
      });
      
      return new Response(JSON.stringify({
        reply: aiResponse.reply || aiResponse.confirmationQuestion,
        intent: aiResponse.intent,
        action: { type: "NONE", payload: {} },
        needsConfirmation: true,
        confirmationQuestion: aiResponse.confirmationQuestion
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // 6. Handle query intents (no confirmation needed)
    if (["QUERY_TASKS", "QUERY_EVENTS", "QUERY_BUDGET"].includes(aiResponse.intent)) {
      return new Response(JSON.stringify({
        reply: aiResponse.reply,
        intent: aiResponse.intent,
        action: { type: "NONE", payload: {} },
        needsConfirmation: false,
        confirmationQuestion: null
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // 7. Default: conversational response
    return new Response(JSON.stringify({
      reply: aiResponse.reply || "Come posso aiutarti?",
      intent: aiResponse.intent || "NONE",
      action: { type: "NONE", payload: {} },
      needsConfirmation: false,
      confirmationQuestion: null
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[AI-FREE] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        reply: "Si è verificato un errore. Riprova tra poco 😊",
        intent: "ERROR",
        action: { type: "NONE", payload: {} },
        needsConfirmation: false,
        confirmationQuestion: null
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
