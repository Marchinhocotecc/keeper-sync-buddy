import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract and validate JWT from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Create auth client to verify token
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: authData, error: userError } = await authClient.auth.getUser();
    
    if (userError || !authData?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Session expired. Please login again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Extract userId from verified JWT (ignore body.user_id for security)
    const user_id = authData.user.id;
    console.log(`[AI-ASSISTANT] Authenticated user: ${user_id}`);

    // Fetch all user data in parallel
    const [todosRes, settingsRes, wellnessRes, expensesRes] = await Promise.all([
      supabase.from("todos").select("*").eq("user_id", user_id),
      supabase.from("settings").select("*").eq("user_id", user_id).maybeSingle(),
      supabase.from("wellness_data").select("*").eq("user_id", user_id).order("date", { ascending: false }).limit(30),
      supabase.from("expenses").select("*").eq("user_id", user_id).order("date", { ascending: false }).limit(100),
    ]);

    const userData = {
      todos: todosRes.data || [],
      settings: settingsRes.data || {},
      wellness: wellnessRes.data || [],
      expenses: expensesRes.data || [],
    };

    // Calculate totals
    const totalExpenses = userData.expenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);
    const monthlyBudget = userData.settings.monthly_budget || 0;
    const completedTasks = userData.todos.filter((t: any) => t.completed).length;
    const totalTasks = userData.todos.length;

    const HUGGINGFACE_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!HUGGINGFACE_API_KEY) {
      throw new Error("HUGGINGFACE_API_KEY is not configured");
    }

    // Build AI prompt with user data
    const prompt = `You are a personal assistant analyzing user data. Provide insights in JSON format.

User Data:
- Tasks: ${totalTasks} total, ${completedTasks} completed
- Monthly Budget: €${monthlyBudget}, Spent: €${totalExpenses.toFixed(2)}
- Recent Wellness: ${userData.wellness.length} entries
- Recent Expenses: ${userData.expenses.length} transactions

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief overview of tasks and expenses",
  "wellnessTips": ["tip1", "tip2", "tip3"],
  "budgetAnalysis": "Analysis of spending vs budget",
  "recommendations": ["recommendation1", "recommendation2"]
}`;

    const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 800,
          temperature: 0.7,
          top_p: 0.95,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Hugging Face API error:", response.status, errorText);
      
      if (response.status === 503) {
        return new Response(
          JSON.stringify({ error: "Model is loading. Please try again in a moment." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    let aiResponse = Array.isArray(aiData) && aiData[0]?.generated_text 
      ? aiData[0].generated_text 
      : "{}";

    // Try to parse AI response as JSON, fallback to default structure
    let analysis;
    try {
      analysis = JSON.parse(aiResponse);
    } catch {
      analysis = {
        summary: `You have ${completedTasks}/${totalTasks} tasks completed and spent €${totalExpenses.toFixed(2)} of your €${monthlyBudget} budget.`,
        wellnessTips: ["Track your daily activities", "Maintain regular sleep schedule", "Stay hydrated"],
        budgetAnalysis: totalExpenses > monthlyBudget 
          ? `⚠️ You've exceeded your budget by €${(totalExpenses - monthlyBudget).toFixed(2)}`
          : `✅ You're within budget. €${(monthlyBudget - totalExpenses).toFixed(2)} remaining.`,
        recommendations: ["Complete pending tasks", "Review your spending habits", "Update wellness data regularly"],
      };
    }

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
