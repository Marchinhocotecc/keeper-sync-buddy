/**
 * State Module - Assistant State Management
 */

import { PendingAction } from "./types.ts";

// ============================================================================
// PENDING ACTION STATE
// ============================================================================

export async function getPendingAction(supabase: any, userId: string): Promise<PendingAction | null> {
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

export async function setPendingAction(supabase: any, userId: string, action: PendingAction | null): Promise<void> {
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      intent_payload: { pendingAction: action },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// ============================================================================
// FULL ASSISTANT STATE
// ============================================================================

export async function getAssistantState(supabase: any, userId: string): Promise<any> {
  const { data } = await supabase
    .from("assistant_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  return data || { active_intent: 'NONE', intent_payload: {} };
}

export async function updateAssistantState(supabase: any, userId: string, patch: any): Promise<void> {
  const current = await getAssistantState(supabase, userId);
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      ...current,
      ...patch,
      intent_payload: { ...current.intent_payload, ...patch.intent_payload },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

export async function clearAssistantState(supabase: any, userId: string): Promise<void> {
  await supabase
    .from("assistant_state")
    .upsert({
      user_id: userId,
      active_intent: 'NONE',
      intent_payload: {},
      missing_fields: [],
      awaiting_confirmation: false,
      attempts: 0,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
}

// ============================================================================
// USER CONTEXT
// ============================================================================

export async function fetchUserContext(supabase: any, userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  
  const [todosRes, eventsRes, expensesRes, budgetRes] = await Promise.all([
    supabase.from("todos").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("calendar_events").select("*").eq("user_id", userId).gte("start_time", today).order("start_time").limit(10),
    supabase.from("expenses").select("*").eq("user_id", userId).gte("date", startOfMonth.toISOString().split("T")[0]).order("date", { ascending: false }).limit(20),
    supabase.from("budgets").select("*").eq("user_id", userId).order("year", { ascending: false }).limit(1).maybeSingle()
  ]);
  
  return {
    todos: todosRes.data || [],
    events: eventsRes.data || [],
    expenses: expensesRes.data || [],
    budget: budgetRes.data
  };
}
