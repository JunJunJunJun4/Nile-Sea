
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_generations": {
                  Row: {
                    "created_at": string,"id": string,"input_tokens": number | null,"model": string,"output_tokens": number | null,"requested_count": number,"status": string,"topic": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"input_tokens"?: number | null,"model": string,"output_tokens"?: number | null,"requested_count": number,"status": string,"topic": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"input_tokens"?: number | null,"model"?: string,"output_tokens"?: number | null,"requested_count"?: number,"status"?: string,"topic"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_generations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"answers": {
                  Row: {
                    "answered_at": string,"attempt_id": string,"grading_status": string,"id": string,"is_correct": boolean | null,"question_id": string,"question_set_id": string | null,"question_version": number,"response": Json | null,"score": number | null,"selected_choice_id": string | null,"time_ms": number | null,"user_id": string
                  }
                  Insert: {
                    "answered_at"?: string,"attempt_id": string,"grading_status"?: string,"id"?: string,"is_correct"?: boolean | null,"question_id": string,"question_set_id"?: string | null,"question_version": number,"response"?: Json | null,"score"?: number | null,"selected_choice_id"?: string | null,"time_ms"?: number | null,"user_id": string
                  }
                  Update: {
                    "answered_at"?: string,"attempt_id"?: string,"grading_status"?: string,"id"?: string,"is_correct"?: boolean | null,"question_id"?: string,"question_set_id"?: string | null,"question_version"?: number,"response"?: Json | null,"score"?: number | null,"selected_choice_id"?: string | null,"time_ms"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "answers_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "answers_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "answers_question_set_id_fkey"
      columns: ["question_set_id"]
isOneToOne: false
      referencedRelation: "question_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "answers_selected_choice_id_fkey"
      columns: ["selected_choice_id"]
isOneToOne: false
      referencedRelation: "question_choices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "answers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attempt_questions": {
                  Row: {
                    "attempt_id": string,"position": number,"question_id": string,"user_id": string
                  }
                  Insert: {
                    "attempt_id": string,"position": number,"question_id": string,"user_id": string
                  }
                  Update: {
                    "attempt_id"?: string,"position"?: number,"question_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempt_questions_attempt_id_fkey"
      columns: ["attempt_id"]
isOneToOne: false
      referencedRelation: "attempts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_questions_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempt_questions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attempts": {
                  Row: {
                    "answered_count": number,"clear_mode": string,"clear_threshold": number,"completed_at": string | null,"correct_count": number,"dedupe_scope": string,"expires_at": string | null,"feedback_mode": string,"id": string,"mode": string,"planned_count": number,"question_set_id": string | null,"score": number | null,"skipped_count": number,"started_at": string,"time_limit_sec": number | null,"user_id": string
                  }
                  Insert: {
                    "answered_count"?: number,"clear_mode": string,"clear_threshold": number,"completed_at"?: string | null,"correct_count"?: number,"dedupe_scope": string,"expires_at"?: string | null,"feedback_mode"?: string,"id"?: string,"mode"?: string,"planned_count"?: number,"question_set_id"?: string | null,"score"?: number | null,"skipped_count"?: number,"started_at"?: string,"time_limit_sec"?: number | null,"user_id": string
                  }
                  Update: {
                    "answered_count"?: number,"clear_mode"?: string,"clear_threshold"?: number,"completed_at"?: string | null,"correct_count"?: number,"dedupe_scope"?: string,"expires_at"?: string | null,"feedback_mode"?: string,"id"?: string,"mode"?: string,"planned_count"?: number,"question_set_id"?: string | null,"score"?: number | null,"skipped_count"?: number,"started_at"?: string,"time_limit_sec"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_question_set_id_fkey"
      columns: ["question_set_id"]
isOneToOne: false
      referencedRelation: "question_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attempts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "depth": number,"description": string | null,"id": string,"name": string,"parent_id": string | null,"path": string,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "depth": number,"description"?: string | null,"id"?: string,"name": string,"parent_id"?: string | null,"path": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "depth"?: number,"description"?: string | null,"id"?: string,"name"?: string,"parent_id"?: string | null,"path"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_activity": {
                  Row: {
                    "activity_date": string,"answered_count": number,"correct_count": number,"study_seconds": number,"user_id": string,"xp_earned": number
                  }
                  Insert: {
                    "activity_date": string,"answered_count"?: number,"correct_count"?: number,"study_seconds"?: number,"user_id": string,"xp_earned"?: number
                  }
                  Update: {
                    "activity_date"?: string,"answered_count"?: number,"correct_count"?: number,"study_seconds"?: number,"user_id"?: string,"xp_earned"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_activity_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"knowledge_items": {
                  Row: {
                    "category_id": string | null,"created_at": string,"definition": string | null,"id": string,"kind": string,"label": string,"normalized_label": string,"note": string | null,"reading": string | null
                  }
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"definition"?: string | null,"id"?: string,"kind": string,"label": string,"normalized_label": string,"note"?: string | null,"reading"?: string | null
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"definition"?: string | null,"id"?: string,"kind"?: string,"label"?: string,"normalized_label"?: string,"note"?: string | null,"reading"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "can_access_all_sets": boolean,"can_use_ai": boolean,"daily_question_limit": number | null,"key": string,"name": string,"sort_order": number,"stripe_price_id": string | null
                  }
                  Insert: {
                    "can_access_all_sets"?: boolean,"can_use_ai"?: boolean,"daily_question_limit"?: number | null,"key": string,"name": string,"sort_order"?: number,"stripe_price_id"?: string | null
                  }
                  Update: {
                    "can_access_all_sets"?: boolean,"can_use_ai"?: boolean,"daily_question_limit"?: number | null,"key"?: string,"name"?: string,"sort_order"?: number,"stripe_price_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string | null,"id": string,"role": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"role"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"role"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"question_answer_keys": {
                  Row: {
                    "grading": string,"question_id": string,"spec": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "grading"?: string,"question_id": string,"spec": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "grading"?: string,"question_id"?: string,"spec"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_answer_keys_question_id_fkey"
      columns: ["question_id"]
isOneToOne: true
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"question_choices": {
                  Row: {
                    "body": string,"id": string,"is_correct": boolean,"position": number,"question_id": string
                  }
                  Insert: {
                    "body": string,"id"?: string,"is_correct"?: boolean,"position": number,"question_id": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"is_correct"?: boolean,"position"?: number,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_choices_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"question_knowledge_items": {
                  Row: {
                    "knowledge_item_id": string,"question_id": string
                  }
                  Insert: {
                    "knowledge_item_id": string,"question_id": string
                  }
                  Update: {
                    "knowledge_item_id"?: string,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_knowledge_items_knowledge_item_id_fkey"
      columns: ["knowledge_item_id"]
isOneToOne: false
      referencedRelation: "knowledge_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_knowledge_items_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"question_set_items": {
                  Row: {
                    "position": number,"question_id": string,"question_set_id": string
                  }
                  Insert: {
                    "position": number,"question_id": string,"question_set_id": string
                  }
                  Update: {
                    "position"?: number,"question_id"?: string,"question_set_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_set_items_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_set_items_question_set_id_fkey"
      columns: ["question_set_id"]
isOneToOne: false
      referencedRelation: "question_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"question_sets": {
                  Row: {
                    "category_id": string | null,"created_at": string,"description": string | null,"id": string,"is_free": boolean,"kind": string,"owner_id": string | null,"pass_score": number | null,"question_count": number,"status": string,"time_limit_sec": number | null,"title": string,"updated_at": string,"visibility": string
                  }
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_free"?: boolean,"kind"?: string,"owner_id"?: string | null,"pass_score"?: number | null,"question_count"?: number,"status"?: string,"time_limit_sec"?: number | null,"title": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_free"?: boolean,"kind"?: string,"owner_id"?: string | null,"pass_score"?: number | null,"question_count"?: number,"status"?: string,"time_limit_sec"?: number | null,"title"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "question_sets_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "question_sets_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "body": string,"category_id": string | null,"content": Json | null,"created_at": string,"created_by": string | null,"difficulty": number | null,"explanation": string | null,"format": string,"id": string,"source": string,"status": string,"structure_type_key": string | null,"updated_at": string,"version": number
                  }
                  Insert: {
                    "body": string,"category_id"?: string | null,"content"?: Json | null,"created_at"?: string,"created_by"?: string | null,"difficulty"?: number | null,"explanation"?: string | null,"format"?: string,"id"?: string,"source"?: string,"status"?: string,"structure_type_key"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "body"?: string,"category_id"?: string | null,"content"?: Json | null,"created_at"?: string,"created_by"?: string | null,"difficulty"?: number | null,"explanation"?: string | null,"format"?: string,"id"?: string,"source"?: string,"status"?: string,"structure_type_key"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_structure_type_key_fkey"
      columns: ["structure_type_key"]
isOneToOne: false
      referencedRelation: "structure_types"
      referencedColumns: ["key"]
    }
                  ]
                },"stripe_events": {
                  Row: {
                    "id": string,"received_at": string,"type": string
                  }
                  Insert: {
                    "id": string,"received_at"?: string,"type": string
                  }
                  Update: {
                    "id"?: string,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"structure_types": {
                  Row: {
                    "description": string | null,"key": string,"label_ja": string,"sort_order": number
                  }
                  Insert: {
                    "description"?: string | null,"key": string,"label_ja": string,"sort_order"?: number
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"label_ja"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"current_period_end": string | null,"plan_key": string,"status": string,"stripe_customer_id": string | null,"stripe_subscription_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "cancel_at_period_end"?: boolean,"current_period_end"?: string | null,"plan_key"?: string,"status"?: string,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"current_period_end"?: string | null,"plan_key"?: string,"status"?: string,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_key_fkey"
      columns: ["plan_key"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_knowledge_progress": {
                  Row: {
                    "correct_count": number,"current_streak": number,"knowledge_item_id": string,"last_answered_at": string | null,"last_is_correct": boolean | null,"user_id": string,"wrong_count": number
                  }
                  Insert: {
                    "correct_count"?: number,"current_streak"?: number,"knowledge_item_id": string,"last_answered_at"?: string | null,"last_is_correct"?: boolean | null,"user_id": string,"wrong_count"?: number
                  }
                  Update: {
                    "correct_count"?: number,"current_streak"?: number,"knowledge_item_id"?: string,"last_answered_at"?: string | null,"last_is_correct"?: boolean | null,"user_id"?: string,"wrong_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_knowledge_progress_knowledge_item_id_fkey"
      columns: ["knowledge_item_id"]
isOneToOne: false
      referencedRelation: "knowledge_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_knowledge_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_question_progress": {
                  Row: {
                    "correct_count": number,"current_streak": number,"last_answered_at": string | null,"last_is_correct": boolean | null,"question_id": string,"user_id": string,"wrong_count": number
                  }
                  Insert: {
                    "correct_count"?: number,"current_streak"?: number,"last_answered_at"?: string | null,"last_is_correct"?: boolean | null,"question_id": string,"user_id": string,"wrong_count"?: number
                  }
                  Update: {
                    "correct_count"?: number,"current_streak"?: number,"last_answered_at"?: string | null,"last_is_correct"?: boolean | null,"question_id"?: string,"user_id"?: string,"wrong_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_question_progress_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_question_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_set_question_progress": {
                  Row: {
                    "correct_count": number,"current_streak": number,"last_answered_at": string | null,"last_is_correct": boolean | null,"question_id": string,"question_set_id": string,"user_id": string,"wrong_count": number
                  }
                  Insert: {
                    "correct_count"?: number,"current_streak"?: number,"last_answered_at"?: string | null,"last_is_correct"?: boolean | null,"question_id": string,"question_set_id": string,"user_id": string,"wrong_count"?: number
                  }
                  Update: {
                    "correct_count"?: number,"current_streak"?: number,"last_answered_at"?: string | null,"last_is_correct"?: boolean | null,"question_id"?: string,"question_set_id"?: string,"user_id"?: string,"wrong_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_set_question_progress_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_set_question_progress_question_set_id_fkey"
      columns: ["question_set_id"]
isOneToOne: false
      referencedRelation: "question_sets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_set_question_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_settings": {
                  Row: {
                    "clear_mode": string,"clear_threshold": number,"daily_goal": number | null,"dedupe_scope": string,"timezone": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "clear_mode"?: string,"clear_threshold"?: number,"daily_goal"?: number | null,"dedupe_scope"?: string,"timezone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "clear_mode"?: string,"clear_threshold"?: number,"daily_goal"?: number | null,"dedupe_scope"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_settings_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_access_all_sets":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"category_proximity":
{ Args: { "p_category_a": string,"p_category_b": string }; Returns: number
                           },
"get_attempt_result":
{ Args: { "p_attempt_id": string }; Returns: {
              "answered_at": string,"correct_choice_body": string,"correct_choice_id": string,"explanation": string,"is_correct": boolean,"question_body": string,"question_id": string,"question_position": number,"selected_choice_body": string,"selected_choice_id": string
            }[]
                           },
"get_review_questions":
{ Args: { "p_question_set_id"?: string }; Returns: (string)[]
                           },
"get_set_progress":
{ Args: { "p_question_set_id": string }; Returns: {
              "cleared_count": number,"total_count": number
            }[]
                           },
"is_active_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"start_attempt":
{ Args: { "p_mode"?: string,"p_question_set_id": string,"p_skip_cleared"?: boolean }; Returns: Json
                           },
"submit_answer":
{ Args: { "p_attempt_id": string,"p_question_id": string,"p_response"?: Json,"p_selected_choice_id"?: string,"p_time_ms"?: number }; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
