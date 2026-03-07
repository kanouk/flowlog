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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          category: string
          content: string | null
          created_at: string
          done_at: string | null
          due_all_day: boolean | null
          due_at: string | null
          ends_at: string | null
          entry_id: string
          extracted_text: string | null
          id: string
          images: string[] | null
          is_all_day: boolean | null
          is_done: boolean
          occurred_at: string
          priority: number | null
          starts_at: string | null
          tag: string | null
          url_metadata: Json | null
          user_id: string
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          done_at?: string | null
          due_all_day?: boolean | null
          due_at?: string | null
          ends_at?: string | null
          entry_id: string
          extracted_text?: string | null
          id?: string
          images?: string[] | null
          is_all_day?: boolean | null
          is_done?: boolean
          occurred_at?: string
          priority?: number | null
          starts_at?: string | null
          tag?: string | null
          url_metadata?: Json | null
          user_id: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          done_at?: string | null
          due_all_day?: boolean | null
          due_at?: string | null
          ends_at?: string | null
          entry_id?: string
          extracted_text?: string | null
          id?: string
          images?: string[] | null
          is_all_day?: boolean | null
          is_done?: boolean
          occurred_at?: string
          priority?: number | null
          starts_at?: string | null
          tag?: string | null
          url_metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_tags: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          created_at: string
          date: string
          formatted_content: string | null
          id: string
          score: number | null
          score_details: string | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          formatted_content?: string | null
          id?: string
          score?: number | null
          score_details?: string | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          formatted_content?: string | null
          id?: string
          score?: number | null
          score_details?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string | null
          code_challenge_method: string | null
          created_at: string | null
          expires_at: string
          id: string
          redirect_uri: string
          scope: string | null
          state: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          code: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          redirect_uri: string
          scope?: string | null
          state?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          redirect_uri?: string
          scope?: string | null
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ai_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          name: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          name: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          name?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ai_feature_settings: {
        Row: {
          assigned_model_id: string | null
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          system_prompt: string | null
          updated_at: string
          user_id: string
          user_prompt_template: string | null
        }
        Insert: {
          assigned_model_id?: string | null
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          system_prompt?: string | null
          updated_at?: string
          user_id: string
          user_prompt_template?: string | null
        }
        Update: {
          assigned_model_id?: string | null
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          system_prompt?: string | null
          updated_at?: string
          user_id?: string
          user_prompt_template?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_ai_feature_settings_assigned_model_id_fkey"
            columns: ["assigned_model_id"]
            isOneToOne: false
            referencedRelation: "user_ai_models"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_models: {
        Row: {
          api_key_id: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          model_name: string
          note: string | null
          provider: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          model_name: string
          note?: string | null
          provider: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          model_name?: string
          note?: string | null
          provider?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ai_models_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "user_ai_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ai_settings: {
        Row: {
          anthropic_api_key: string | null
          auto_ocr: boolean
          behavior_rules: string | null
          created_at: string
          custom_summarize_prompt: string | null
          custom_system_prompt: string | null
          google_api_key: string | null
          id: string
          openai_api_key: string | null
          score_enabled: boolean
          selected_model: string
          selected_provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          auto_ocr?: boolean
          behavior_rules?: string | null
          created_at?: string
          custom_summarize_prompt?: string | null
          custom_system_prompt?: string | null
          google_api_key?: string | null
          id?: string
          openai_api_key?: string | null
          score_enabled?: boolean
          selected_model?: string
          selected_provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          auto_ocr?: boolean
          behavior_rules?: string | null
          created_at?: string
          custom_summarize_prompt?: string | null
          custom_system_prompt?: string | null
          google_api_key?: string | null
          id?: string
          openai_api_key?: string | null
          score_enabled?: boolean
          selected_model?: string
          selected_provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_feature_ai_config: {
        Args: { p_feature_key: string; p_user_id: string }
        Returns: {
          api_key: string
          enabled: boolean
          feature_key: string
          model_name: string
          provider: string
          system_prompt: string
          user_prompt_template: string
        }[]
      }
      get_user_ai_api_keys_safe: {
        Args: never
        Returns: {
          created_at: string
          id: string
          key_hint: string
          name: string
          provider: string
          updated_at: string
          user_id: string
        }[]
      }
      get_user_ai_models_safe: {
        Args: never
        Returns: {
          api_key_id: string
          api_key_name: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          model_name: string
          note: string
          provider: string
          sort_order: number
          updated_at: string
          user_id: string
        }[]
      }
      get_user_ai_settings_safe: {
        Args: never
        Returns: {
          behavior_rules: string
          created_at: string
          custom_summarize_prompt: string
          custom_system_prompt: string
          has_anthropic_key: boolean
          has_google_key: boolean
          has_openai_key: boolean
          id: string
          score_enabled: boolean
          selected_model: string
          selected_provider: string
          updated_at: string
        }[]
      }
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
