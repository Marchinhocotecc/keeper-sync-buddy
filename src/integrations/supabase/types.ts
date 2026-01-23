export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ai_cache: {
        Row: {
          created_at: string | null
          id: string
          prompt_hash: string
          result: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          prompt_hash: string
          result?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          prompt_hash?: string
          result?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_requests: {
        Row: {
          created_at: string | null
          endpoint: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      assistant_state: {
        Row: {
          active_intent: string
          attempts: number
          awaiting_confirmation: boolean
          intent_payload: Json
          last_action_payload: Json
          last_action_type: string
          messages: Json
          missing_fields: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          active_intent?: string
          attempts?: number
          awaiting_confirmation?: boolean
          intent_payload?: Json
          last_action_payload?: Json
          last_action_type?: string
          messages?: Json
          missing_fields?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          active_intent?: string
          attempts?: number
          awaiting_confirmation?: boolean
          intent_payload?: Json
          last_action_payload?: Json
          last_action_type?: string
          messages?: Json
          missing_fields?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          month: number | null
          updated_at: string | null
          user_id: string | null
          year: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          month?: number | null
          updated_at?: string | null
          user_id?: string | null
          year: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          month?: number | null
          updated_at?: string | null
          user_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          end_time: string
          id: string
          start_time: string
          title: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          start_time: string
          title: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          start_time?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          language: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string | null
          language?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string | null
          language?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      requests_log: {
        Row: {
          cached: boolean | null
          endpoint: string | null
          error_message: string | null
          id: string
          prompt: string
          response_time: number | null
          status_code: number
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          cached?: boolean | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          prompt: string
          response_time?: number | null
          status_code: number
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          cached?: boolean | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          prompt?: string
          response_time?: number | null
          status_code?: number
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      scheduled_notifications: {
        Row: {
          body: string
          created_at: string | null
          id: string
          reference_id: string | null
          scheduled_time: string
          shown: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          reference_id?: string | null
          scheduled_time: string
          shown?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          reference_id?: string | null
          scheduled_time?: string
          shown?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string | null
          id: string
          language: string | null
          monthly_budget: number | null
          notifications_enabled: boolean | null
          notify_calendar: boolean | null
          notify_daily_focus: boolean | null
          notify_focus_time: string | null
          notify_task_before_minutes: number | null
          notify_tasks: boolean | null
          notify_wellbeing: boolean | null
          notify_wellbeing_time: string | null
          theme: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          language?: string | null
          monthly_budget?: number | null
          notifications_enabled?: boolean | null
          notify_calendar?: boolean | null
          notify_daily_focus?: boolean | null
          notify_focus_time?: string | null
          notify_task_before_minutes?: number | null
          notify_tasks?: boolean | null
          notify_wellbeing?: boolean | null
          notify_wellbeing_time?: string | null
          theme?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          language?: string | null
          monthly_budget?: number | null
          notifications_enabled?: boolean | null
          notify_calendar?: boolean | null
          notify_daily_focus?: boolean | null
          notify_focus_time?: string | null
          notify_task_before_minutes?: number | null
          notify_tasks?: boolean | null
          notify_wellbeing?: boolean | null
          notify_wellbeing_time?: string | null
          theme?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      todos: {
        Row: {
          completed: boolean | null
          created_at: string | null
          due_date: string | null
          id: string
          priority: string | null
          title: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          title: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      wellness_data: {
        Row: {
          activity: string | null
          created_at: string | null
          date: string
          heart_rate: number | null
          id: string
          meditation_minutes: number | null
          sleep: number | null
          steps: number | null
          user_id: string | null
        }
        Insert: {
          activity?: string | null
          created_at?: string | null
          date: string
          heart_rate?: number | null
          id?: string
          meditation_minutes?: number | null
          sleep?: number | null
          steps?: number | null
          user_id?: string | null
        }
        Update: {
          activity?: string | null
          created_at?: string | null
          date?: string
          heart_rate?: number | null
          id?: string
          meditation_minutes?: number | null
          sleep?: number | null
          steps?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
