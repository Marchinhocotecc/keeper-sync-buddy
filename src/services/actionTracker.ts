/**
 * Layer 4: Action Tracker + Feedback Loop
 * Tracks proposed actions and calculates acceptance rate.
 * Stores everything in assistant_state.intent_payload.actionHistory
 */

import { supabase } from "@/integrations/supabase/client";

export interface ActionEvent {
  id: string;
  type: "create_task" | "adjust_budget" | "set_limit";
  title: string;
  shownAt: string;
  clickedAt?: string;
  completedAt?: string;
  ignored: boolean;
}

async function getPayload(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from("assistant_state")
    .select("intent_payload")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.intent_payload as Record<string, unknown>) || {};
}

async function savePayload(userId: string, payload: Record<string, unknown>): Promise<void> {
  await supabase
    .from("assistant_state")
    .update({
      intent_payload: payload as any,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

function getHistory(payload: Record<string, unknown>): ActionEvent[] {
  return (payload.actionHistory as ActionEvent[]) || [];
}

/**
 * Record that an action was shown to the user
 */
export async function trackActionShown(
  userId: string,
  action: Pick<ActionEvent, "type" | "title">
): Promise<string> {
  const payload = await getPayload(userId);
  const history = getHistory(payload);

  // Mark old un-clicked actions as ignored (24h threshold)
  const now = new Date();
  for (const a of history) {
    if (!a.clickedAt && !a.ignored) {
      const shownAt = new Date(a.shownAt);
      if (now.getTime() - shownAt.getTime() > 24 * 60 * 60 * 1000) {
        a.ignored = true;
      }
    }
  }

  const id = crypto.randomUUID();
  history.push({
    id,
    type: action.type,
    title: action.title,
    shownAt: now.toISOString(),
    ignored: false,
  });

  // Keep last 50 events
  const trimmed = history.slice(-50);
  await savePayload(userId, { ...payload, actionHistory: trimmed });
  return id;
}

/**
 * Record that an action was clicked
 */
export async function trackActionClicked(userId: string, actionId: string): Promise<void> {
  const payload = await getPayload(userId);
  const history = getHistory(payload);
  const action = history.find((a) => a.id === actionId);
  if (action) {
    action.clickedAt = new Date().toISOString();
    action.ignored = false;
    await savePayload(userId, { ...payload, actionHistory: history });
  }
}

/**
 * Record that an action was completed
 */
export async function trackActionCompleted(userId: string, actionId: string): Promise<void> {
  const payload = await getPayload(userId);
  const history = getHistory(payload);
  const action = history.find((a) => a.id === actionId);
  if (action) {
    action.completedAt = new Date().toISOString();
    await savePayload(userId, { ...payload, actionHistory: history });
  }
}

/**
 * Calculate suggestion acceptance rate from history
 */
export function calculateAcceptanceRate(history: ActionEvent[]): number {
  const relevant = history.filter((a) => a.shownAt); // all shown
  if (relevant.length === 0) return 0.5; // default
  const accepted = relevant.filter((a) => a.clickedAt || a.completedAt).length;
  return accepted / relevant.length;
}

/**
 * Get list of ignored action titles (for anti-repetition)
 */
export function getIgnoredSuggestions(history: ActionEvent[]): string[] {
  return history
    .filter((a) => a.ignored)
    .map((a) => a.title)
    .slice(-10); // last 10 ignored
}

/**
 * Count consecutive ignored actions at the end of history
 */
export function countConsecutiveIgnored(history: ActionEvent[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].ignored) count++;
    else break;
  }
  return count;
}
