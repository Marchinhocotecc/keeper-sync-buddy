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
    const { message, user_id } = await req.json();
    
    if (!message) {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get("authorization");
    let effectiveUserId = user_id;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (user && !authError) {
        effectiveUserId = user.id;
      }
    }

    if (!effectiveUserId) {
      return new Response(
        JSON.stringify({ error: "user_id is required or valid authorization header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting: check ai_requests in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentRequests, error: rlError } = await supabase
      .from("ai_requests")
      .select("id")
      .eq("user_id", effectiveUserId)
      .gte("created_at", oneHourAgo);

    if (!rlError && recentRequests && recentRequests.length >= 60) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all user data in parallel
    const [todosRes, settingsRes, wellnessRes, expensesRes] = await Promise.all([
      supabase.from("todos").select("*").eq("user_id", effectiveUserId),
      supabase.from("settings").select("*").eq("user_id", effectiveUserId).maybeSingle(),
      supabase.from("wellness_data").select("*").eq("user_id", effectiveUserId).order("date", { ascending: false }).limit(10),
      supabase.from("expenses").select("*").eq("user_id", effectiveUserId).order("date", { ascending: false }).limit(20),
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
    const DEV_MODE = Deno.env.get("DEVELOPMENT_MODE") === "true";

    if (!HUGGINGFACE_API_KEY) {
      if (DEV_MODE) {
        // Fallback response
        const fallbackResponse = {
          summary: `Echo (dev mode): ${message}. Tasks: ${completedTasks}/${totalTasks}, Budget: €${totalExpenses.toFixed(2)}/€${monthlyBudget}`,
          wellnessTips: ["Stay hydrated", "Get 8 hours of sleep", "Exercise regularly"],
          budgetAnalysis: {
            total: totalExpenses,
            budget: monthlyBudget,
            status: totalExpenses > monthlyBudget ? "over" : "within"
          },
          recommendations: ["Complete your pending tasks", "Review your spending"]
        };

        // Log request
        await supabase.from("ai_requests").insert({ user_id: effectiveUserId });

        return new Response(
          JSON.stringify({ reply: fallbackResponse, source: "fallback-echo" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "HUGGINGFACE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt with user data
    const systemPrompt = `You are an AI personal assistant. Analyze the user's data and provide insights in JSON format.

User Context:
- Tasks: ${totalTasks} total, ${completedTasks} completed
- Monthly Budget: €${monthlyBudget}, Spent: €${totalExpenses.toFixed(2)}
- Recent Wellness entries: ${userData.wellness.length}
- Recent Expenses: ${userData.expenses.length} transactions

User message: ${message}

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief overview of tasks and expenses",
  "wellnessTips": ["tip1", "tip2", "tip3"],
  "budgetAnalysis": {
    "total": ${totalExpenses},
    "budget": ${monthlyBudget},
    "status": "${totalExpenses > monthlyBudget ? 'over' : 'within'}",
    "message": "Analysis of spending vs budget"
  },
  "recommendations": ["recommendation1", "recommendation2"]
}`;

    const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: systemPrompt,
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
      : typeof aiData === "string" ? aiData : JSON.stringify(aiData);

    // Try to parse AI response as JSON
    let parsedReply;
    try {
      parsedReply = JSON.parse(aiResponse);
    } catch {
      // Fallback structure if AI doesn't return valid JSON
      parsedReply = {
        summary: `${aiResponse.slice(0, 200)}... Tasks: ${completedTasks}/${totalTasks}, Budget: €${totalExpenses.toFixed(2)}/€${monthlyBudget}`,
        wellnessTips: ["Track your daily activities", "Maintain regular sleep schedule", "Stay hydrated"],
        budgetAnalysis: {
          total: totalExpenses,
          budget: monthlyBudget,
          status: totalExpenses > monthlyBudget ? "over" : "within",
          message: totalExpenses > monthlyBudget 
            ? `⚠️ You've exceeded your budget by €${(totalExpenses - monthlyBudget).toFixed(2)}`
            : `✅ You're within budget. €${(monthlyBudget - totalExpenses).toFixed(2)} remaining.`
        },
        recommendations: ["Complete pending tasks", "Review your spending habits", "Update wellness data regularly"],
      };
    }

    // Log the request
    await supabase.from("ai_requests").insert({ user_id: effectiveUserId });

    return new Response(
      JSON.stringify({ reply: parsedReply, source: "mistral" }),
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
