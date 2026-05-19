/**
 * Executor Module - Database Operations
 */

import { AIAction } from "./types.ts";
import { normalizeTitle, isForbiddenTitle } from "./parser.ts";

// ============================================================================
// EXECUTE ACTIONS
// ============================================================================

export async function executeAction(
  supabase: any, 
  userId: string, 
  action: AIAction
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    switch (action.type) {
      case "CREATE_TASK": {
        const title = normalizeTitle(action.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido." };
        }
        
        const insertData: any = {
          user_id: userId,
          title: title,
          priority: "medium",
          due_date: action.due_date || null,
          completed: false
        };
        
        const { data, error } = await supabase.from("todos").insert(insertData).select().single();
        
        if (error) throw error;
        
        let message = `✅ Task creato: "${title}"`;
        if (action.recurring) {
          message += ` (ricorrente: ${action.recurring.freq})`;
        }
        
        return { success: true, message, data };
      }
      
      case "CREATE_EVENT": {
        const title = normalizeTitle(action.title || "");
        if (isForbiddenTitle(title)) {
          return { success: false, message: "Titolo non valido." };
        }
        if (!action.start_at) {
          return { success: false, message: "Data/ora mancanti." };
        }
        const startDate = new Date(action.start_at);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
        
        const { data, error } = await supabase.from("calendar_events").insert({
          user_id: userId,
          title: title,
          start_time: action.start_at,
          end_time: action.end_at || endDate.toISOString()
        }).select().single();
        
        if (error) throw error;
        
        const dateStr = startDate.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
        const timeStr = startDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        return { success: true, message: `✅ Evento creato: "${title}" — ${dateStr} ${timeStr}`, data };
      }
      
      case "RECORD_EXPENSE": {
        if (!action.amount || action.amount <= 0) {
          return { success: false, message: "Importo non valido." };
        }
        const { data, error } = await supabase.from("expenses").insert({
          user_id: userId,
          amount: action.amount,
          category: action.category || "altro",
          date: new Date().toISOString().split("T")[0]
        }).select().single();
        
        if (error) throw error;
        return { success: true, message: `✅ Spesa salvata: €${action.amount.toFixed(2)} — ${action.category || 'altro'}`, data };
      }
      
      case "DELETE_ALL_TASKS": {
        const { error } = await supabase.from("todos").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutti i task eliminati." };
      }
      
      case "DELETE_ALL_EVENTS": {
        const { error } = await supabase.from("calendar_events").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutti gli eventi eliminati." };
      }
      
      case "DELETE_ALL_EXPENSES": {
        const { error } = await supabase.from("expenses").delete().eq("user_id", userId);
        if (error) throw error;
        return { success: true, message: "✅ Tutte le spese eliminate." };
      }
      
      default:
        return { success: false, message: `Azione non supportata: ${action.type}` };
    }
  } catch (error) {
    console.error("[AI-FREE] Action execution error:", error);
    return { success: false, message: "Errore nell'esecuzione." };
  }
}
