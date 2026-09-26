/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * `npm run gen:types` writes this from the migrations that declare the
 * schema; `npm run gen:types -- --check` fails when the two disagree, and CI
 * runs that check, so an edit here is reverted by the next run rather than
 * kept. Change the migration.
 *
 * Source (DATA-01a → DATA-01d, DATA-05):
 *   supabase/migrations/20260921000000_catalog_domain.sql
 *   supabase/migrations/20260921000001_user_baseline.sql
 *   supabase/migrations/20260921000002_user_constraints.sql
 *   supabase/migrations/20260921000002_workout_domain.sql
 *   supabase/migrations/20260921000003_execution_domain.sql
 *   supabase/migrations/20260921000004_generation_candidates.sql
 *   supabase/migrations/20260921000005_session_lifecycle.sql
 *   supabase/migrations/20260921000006_streak_sessions.sql
 *   supabase/migrations/20260921000007_complete_onboarding.sql
 *   supabase/migrations/20260921000008_location_writes.sql
 *   supabase/migrations/20260921000009_session_reconstruction.sql
 *   supabase/migrations/20260921000010_load_anchors.sql
 *   supabase/migrations/20260921000011_conditioning_history.sql
 *   supabase/migrations/20260921000012_swap_session_block.sql
 *   supabase/migrations/20260921000013_swap_anchor_exclusion.sql
 *   supabase/migrations/20260921000014_rest_days.sql
 *   supabase/migrations/20260921000015_saved_workouts.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      block_results: {
        Row: {
          id: string
          block_id: string
          elapsed_seconds: number | null
          completed_under_cap: boolean | null
          rounds_completed: number | null
          partial_round_reps: number | null
          minutes_completed: number | null
          highest_rung: number | null
          perceived_effort: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          block_id: string
          elapsed_seconds?: number | null
          completed_under_cap?: boolean | null
          rounds_completed?: number | null
          partial_round_reps?: number | null
          minutes_completed?: number | null
          highest_rung?: number | null
          perceived_effort?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          block_id?: string
          elapsed_seconds?: number | null
          completed_under_cap?: boolean | null
          rounds_completed?: number | null
          partial_round_reps?: number | null
          minutes_completed?: number | null
          highest_rung?: number | null
          perceived_effort?: number | null
          notes?: string | null
          created_at?: string
        }
      }
      component_pattern_map: {
        Row: {
          component: string
          movement_pattern: Database['public']['Enums']['movement_pattern']
        }
        Insert: {
          component: string
          movement_pattern: Database['public']['Enums']['movement_pattern']
        }
        Update: {
          component?: string
          movement_pattern?: Database['public']['Enums']['movement_pattern']
        }
      }
      exercise_definitions: {
        Row: {
          id: string
          name: string
          equipment_options: string[]
          default_equipment: string
          equipment_display_names: Json
          regression: string | null
          progression: string | null
          coaching_cues: string[]
          sections: Database['public']['Enums']['section_type'][]
          can_be_primary: boolean
          component_movements: string[]
          exercise_role: Database['public']['Enums']['exercise_role']
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          equipment_options: string[]
          default_equipment: string
          equipment_display_names?: Json
          regression?: string | null
          progression?: string | null
          coaching_cues?: string[]
          sections?: Database['public']['Enums']['section_type'][]
          can_be_primary?: boolean
          component_movements?: string[]
          exercise_role?: Database['public']['Enums']['exercise_role']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          equipment_options?: string[]
          default_equipment?: string
          equipment_display_names?: Json
          regression?: string | null
          progression?: string | null
          coaching_cues?: string[]
          sections?: Database['public']['Enums']['section_type'][]
          can_be_primary?: boolean
          component_movements?: string[]
          exercise_role?: Database['public']['Enums']['exercise_role']
          created_at?: string
          updated_at?: string
        }
      }
      exercise_muscle_groups: {
        Row: {
          exercise_id: string
          muscle_group: string
          role: Database['public']['Enums']['muscle_role']
        }
        Insert: {
          exercise_id: string
          muscle_group: string
          role: Database['public']['Enums']['muscle_role']
        }
        Update: {
          exercise_id?: string
          muscle_group?: string
          role?: Database['public']['Enums']['muscle_role']
        }
      }
      exercise_pattern_weights: {
        Row: {
          exercise_id: string
          movement_pattern: Database['public']['Enums']['movement_pattern']
          is_primary: boolean
        }
        Insert: {
          exercise_id: string
          movement_pattern: Database['public']['Enums']['movement_pattern']
          is_primary?: boolean
        }
        Update: {
          exercise_id?: string
          movement_pattern?: Database['public']['Enums']['movement_pattern']
          is_primary?: boolean
        }
      }
      exercise_set_logs: {
        Row: {
          id: string
          workout_exercise_id: string
          prescription_revision_status: Database['public']['Enums']['revision_status']
          set_number: number
          actual_reps: number | null
          actual_duration_seconds: number | null
          actual_distance: number | null
          actual_distance_unit: Database['public']['Enums']['distance_unit'] | null
          weight: number | null
          weight_unit: Database['public']['Enums']['weight_unit']
          rpe: number | null
          is_warmup_set: boolean
          created_at: string
        }
        Insert: {
          id: string
          workout_exercise_id: string
          prescription_revision_status?: Database['public']['Enums']['revision_status']
          set_number: number
          actual_reps?: number | null
          actual_duration_seconds?: number | null
          actual_distance?: number | null
          actual_distance_unit?: Database['public']['Enums']['distance_unit'] | null
          weight?: number | null
          weight_unit: Database['public']['Enums']['weight_unit']
          rpe?: number | null
          is_warmup_set?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          workout_exercise_id?: string
          prescription_revision_status?: Database['public']['Enums']['revision_status']
          set_number?: number
          actual_reps?: number | null
          actual_duration_seconds?: number | null
          actual_distance?: number | null
          actual_distance_unit?: Database['public']['Enums']['distance_unit'] | null
          weight?: number | null
          weight_unit?: Database['public']['Enums']['weight_unit']
          rpe?: number | null
          is_warmup_set?: boolean
          created_at?: string
        }
      }
      focus_pattern_map: {
        Row: {
          session_focus: Database['public']['Enums']['session_focus']
          movement_pattern: Database['public']['Enums']['movement_pattern']
        }
        Insert: {
          session_focus: Database['public']['Enums']['session_focus']
          movement_pattern: Database['public']['Enums']['movement_pattern']
        }
        Update: {
          session_focus?: Database['public']['Enums']['session_focus']
          movement_pattern?: Database['public']['Enums']['movement_pattern']
        }
      }
      load_anchors: {
        Row: {
          user_id: string
          exercise_id: string
          equipment_used: string
          anchor_value: number
          unit: Database['public']['Enums']['weight_unit']
          confidence: Database['public']['Enums']['anchor_confidence']
          session_count: number
          last_session_date: string
          updated_at: string
        }
        Insert: {
          user_id: string
          exercise_id: string
          equipment_used: string
          anchor_value: number
          unit: Database['public']['Enums']['weight_unit']
          confidence: Database['public']['Enums']['anchor_confidence']
          session_count: number
          last_session_date: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          exercise_id?: string
          equipment_used?: string
          anchor_value?: number
          unit?: Database['public']['Enums']['weight_unit']
          confidence?: Database['public']['Enums']['anchor_confidence']
          session_count?: number
          last_session_date?: string
          updated_at?: string
        }
      }
      location_equipment: {
        Row: {
          location_id: string
          equipment_id: string
          created_at: string
        }
        Insert: {
          location_id: string
          equipment_id: string
          created_at?: string
        }
        Update: {
          location_id?: string
          equipment_id?: string
          created_at?: string
        }
      }
      locations: {
        Row: {
          id: string
          user_id: string
          created_at: string
          updated_at: string
          name: string
          tier: Database['public']['Enums']['equipment_tier']
          is_default: boolean
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          updated_at?: string
          name: string
          tier: Database['public']['Enums']['equipment_tier']
          is_default?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
          name?: string
          tier?: Database['public']['Enums']['equipment_tier']
          is_default?: boolean
        }
      }
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          experience_level: Database['public']['Enums']['experience_level'] | null
          goal_preset: Database['public']['Enums']['goal_preset'] | null
          enabled_sections: Database['public']['Enums']['section_type'][]
          weight_unit: Database['public']['Enums']['weight_unit']
          onboarded_at: string | null
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          experience_level?: Database['public']['Enums']['experience_level'] | null
          goal_preset?: Database['public']['Enums']['goal_preset'] | null
          enabled_sections?: Database['public']['Enums']['section_type'][]
          weight_unit?: Database['public']['Enums']['weight_unit']
          onboarded_at?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          experience_level?: Database['public']['Enums']['experience_level'] | null
          goal_preset?: Database['public']['Enums']['goal_preset'] | null
          enabled_sections?: Database['public']['Enums']['section_type'][]
          weight_unit?: Database['public']['Enums']['weight_unit']
          onboarded_at?: string | null
        }
      }
      rest_days: {
        Row: {
          id: string
          user_id: string
          day: string
          reason: Database['public']['Enums']['rest_day_reason']
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          day: string
          reason: Database['public']['Enums']['rest_day_reason']
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          day?: string
          reason?: Database['public']['Enums']['rest_day_reason']
          note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      saved_workout_completions: {
        Row: {
          id: string
          saved_workout_id: string
          session_id: string
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          saved_workout_id: string
          session_id: string
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          saved_workout_id?: string
          session_id?: string
          started_at?: string
          completed_at?: string | null
        }
      }
      saved_workouts: {
        Row: {
          id: string
          user_id: string
          original_session_id: string | null
          workout_snapshot: Json
          snapshot_contract_version: string
          title: string
          session_focus: Database['public']['Enums']['session_focus']
          intensity: number
          duration_mins: number
          times_completed: number
          last_completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          original_session_id?: string | null
          workout_snapshot: Json
          snapshot_contract_version: string
          title: string
          session_focus: Database['public']['Enums']['session_focus']
          intensity: number
          duration_mins: number
          times_completed?: number
          last_completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          original_session_id?: string | null
          workout_snapshot?: Json
          snapshot_contract_version?: string
          title?: string
          session_focus?: Database['public']['Enums']['session_focus']
          intensity?: number
          duration_mins?: number
          times_completed?: number
          last_completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_constraints: {
        Row: {
          id: string
          user_id: string
          scope: Database['public']['Enums']['constraint_scope']
          action: Database['public']['Enums']['constraint_action']
          persistence: Database['public']['Enums']['constraint_persistence']
          applies_to_session_id: string | null
          target_exercise_id: string | null
          target_pattern: Database['public']['Enums']['movement_pattern'] | null
          target_equipment: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          scope: Database['public']['Enums']['constraint_scope']
          action: Database['public']['Enums']['constraint_action']
          persistence?: Database['public']['Enums']['constraint_persistence']
          applies_to_session_id?: string | null
          target_exercise_id?: string | null
          target_pattern?: Database['public']['Enums']['movement_pattern'] | null
          target_equipment?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          scope?: Database['public']['Enums']['constraint_scope']
          action?: Database['public']['Enums']['constraint_action']
          persistence?: Database['public']['Enums']['constraint_persistence']
          applies_to_session_id?: string | null
          target_exercise_id?: string | null
          target_pattern?: Database['public']['Enums']['movement_pattern'] | null
          target_equipment?: string | null
          note?: string | null
          created_at?: string
        }
      }
      workout_blocks: {
        Row: {
          id: string
          section_id: string
          created_at: string
          order_index: number
          structure_type: Database['public']['Enums']['structure_type']
          rounds: number | null
          timer_type: Database['public']['Enums']['timer_contract']
          timer_seconds: number | null
          round_rest_seconds: number | null
          rep_scheme: Database['public']['Enums']['rep_scheme']
          block_notes: string | null
        }
        Insert: {
          id?: string
          section_id: string
          created_at?: string
          order_index: number
          structure_type: Database['public']['Enums']['structure_type']
          rounds?: number | null
          timer_type?: Database['public']['Enums']['timer_contract']
          timer_seconds?: number | null
          round_rest_seconds?: number | null
          rep_scheme?: Database['public']['Enums']['rep_scheme']
          block_notes?: string | null
        }
        Update: {
          id?: string
          section_id?: string
          created_at?: string
          order_index?: number
          structure_type?: Database['public']['Enums']['structure_type']
          rounds?: number | null
          timer_type?: Database['public']['Enums']['timer_contract']
          timer_seconds?: number | null
          round_rest_seconds?: number | null
          rep_scheme?: Database['public']['Enums']['rep_scheme']
          block_notes?: string | null
        }
      }
      workout_exercises: {
        Row: {
          id: string
          block_id: string
          exercise_id: string
          order_index: number
          modality: Database['public']['Enums']['prescription_modality']
          sets: number | null
          target_kind: Database['public']['Enums']['target_kind']
          target_value: number | null
          target_min: number | null
          target_max: number | null
          target_sequence: number[] | null
          per_side: boolean
          distance_unit: Database['public']['Enums']['distance_unit'] | null
          rest_seconds: number | null
          tempo: string | null
          load_type: Database['public']['Enums']['load_guidance'] | null
          load_value: number | null
          equipment_used: string
          is_interval_exercise: boolean
          slot_id: string
          replaces_id: string | null
          origin: Database['public']['Enums']['prescription_origin']
          created_at: string
          superseded_at: string | null
          revision_status: Database['public']['Enums']['revision_status']
          execution_status: Database['public']['Enums']['execution_status']
          exercise_notes: string | null
        }
        Insert: {
          id?: string
          block_id: string
          exercise_id: string
          order_index: number
          modality: Database['public']['Enums']['prescription_modality']
          sets?: number | null
          target_kind: Database['public']['Enums']['target_kind']
          target_value?: number | null
          target_min?: number | null
          target_max?: number | null
          target_sequence?: number[] | null
          per_side?: boolean
          distance_unit?: Database['public']['Enums']['distance_unit'] | null
          rest_seconds?: number | null
          tempo?: string | null
          load_type?: Database['public']['Enums']['load_guidance'] | null
          load_value?: number | null
          equipment_used: string
          is_interval_exercise?: boolean
          slot_id: string
          replaces_id?: string | null
          origin?: Database['public']['Enums']['prescription_origin']
          created_at?: string
          superseded_at?: string | null
          revision_status?: Database['public']['Enums']['revision_status']
          execution_status?: Database['public']['Enums']['execution_status']
          exercise_notes?: string | null
        }
        Update: {
          id?: string
          block_id?: string
          exercise_id?: string
          order_index?: number
          modality?: Database['public']['Enums']['prescription_modality']
          sets?: number | null
          target_kind?: Database['public']['Enums']['target_kind']
          target_value?: number | null
          target_min?: number | null
          target_max?: number | null
          target_sequence?: number[] | null
          per_side?: boolean
          distance_unit?: Database['public']['Enums']['distance_unit'] | null
          rest_seconds?: number | null
          tempo?: string | null
          load_type?: Database['public']['Enums']['load_guidance'] | null
          load_value?: number | null
          equipment_used?: string
          is_interval_exercise?: boolean
          slot_id?: string
          replaces_id?: string | null
          origin?: Database['public']['Enums']['prescription_origin']
          created_at?: string
          superseded_at?: string | null
          revision_status?: Database['public']['Enums']['revision_status']
          execution_status?: Database['public']['Enums']['execution_status']
          exercise_notes?: string | null
        }
      }
      workout_sections: {
        Row: {
          id: string
          session_id: string
          created_at: string
          updated_at: string
          section_type: Database['public']['Enums']['section_type']
          order_index: number
          section_title: string
          section_notes: string | null
        }
        Insert: {
          id?: string
          session_id: string
          created_at?: string
          updated_at?: string
          section_type: Database['public']['Enums']['section_type']
          order_index: number
          section_title: string
          section_notes?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          created_at?: string
          updated_at?: string
          section_type?: Database['public']['Enums']['section_type']
          order_index?: number
          section_title?: string
          section_notes?: string | null
        }
      }
      workout_sessions: {
        Row: {
          id: string
          user_id: string
          location_id: string | null
          created_at: string
          updated_at: string
          date: string
          title: string
          overview: string | null
          session_focus: Database['public']['Enums']['session_focus']
          goal_preset: Database['public']['Enums']['goal_preset'] | null
          requested_duration_mins: number
          effective_duration_target_mins: number
          computed_duration_mins: number | null
          actual_duration_mins: number | null
          requested_intensity: number
          effective_intensity: number
          adjustment_reason: string | null
          generation_notes: string | null
          prompt_version: string
          contract_version: string
          started_at: string | null
          completed_at: string | null
          mood: number | null
          session_notes: string | null
          counts_for_streak: boolean
          abandoned_at: string | null
          is_deload: boolean
        }
        Insert: {
          id?: string
          user_id: string
          location_id?: string | null
          created_at?: string
          updated_at?: string
          date: string
          title: string
          overview?: string | null
          session_focus: Database['public']['Enums']['session_focus']
          goal_preset?: Database['public']['Enums']['goal_preset'] | null
          requested_duration_mins: number
          effective_duration_target_mins: number
          computed_duration_mins?: number | null
          actual_duration_mins?: number | null
          requested_intensity: number
          effective_intensity: number
          adjustment_reason?: string | null
          generation_notes?: string | null
          prompt_version: string
          contract_version: string
          started_at?: string | null
          completed_at?: string | null
          mood?: number | null
          session_notes?: string | null
          counts_for_streak?: boolean
          abandoned_at?: string | null
          is_deload?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          location_id?: string | null
          created_at?: string
          updated_at?: string
          date?: string
          title?: string
          overview?: string | null
          session_focus?: Database['public']['Enums']['session_focus']
          goal_preset?: Database['public']['Enums']['goal_preset'] | null
          requested_duration_mins?: number
          effective_duration_target_mins?: number
          computed_duration_mins?: number | null
          actual_duration_mins?: number | null
          requested_intensity?: number
          effective_intensity?: number
          adjustment_reason?: string | null
          generation_notes?: string | null
          prompt_version?: string
          contract_version?: string
          started_at?: string | null
          completed_at?: string | null
          mood?: number | null
          session_notes?: string | null
          counts_for_streak?: boolean
          abandoned_at?: string | null
          is_deload?: boolean
        }
      }
    }
    Functions: {
      abandon_session: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      anchor_evidence: {
        Args: {
          p_user_id: string
        }
        Returns: { session_id: string; session_date: string; logged_at: string; exercise_id: string; equipment_used: string; set_number: number; actual_reps: number; prescribed_reps: number; weight: number; weight_unit: Database['public']['Enums']['weight_unit']; rpe: number }[]
      }
      complete_onboarding: {
        Args: {
          p_location_name: string
          p_location_tier: Database['public']['Enums']['equipment_tier']
          p_equipment: string[]
          p_experience_level: Database['public']['Enums']['experience_level']
          p_goal_preset: Database['public']['Enums']['goal_preset']
          p_sections: Database['public']['Enums']['section_type'][]
          p_avoid_patterns?: Database['public']['Enums']['movement_pattern'][] | null
          p_note?: string | null
        }
        Returns: Json
      }
      complete_session: {
        Args: {
          p_session_id: string
          p_actual_duration_mins?: number | null
        }
        Returns: Json
      }
      conditioning_history: {
        Args: {
          p_user_id: string
          p_limit?: number | null
        }
        Returns: { session_id: string; session_date: string; effective_intensity: number; goal_preset: Database['public']['Enums']['goal_preset']; section_id: string; section_order: number; block_id: string; block_order: number; structure_type: Database['public']['Enums']['structure_type']; rep_scheme: Database['public']['Enums']['rep_scheme']; timer_type: Database['public']['Enums']['timer_contract']; timer_seconds: number; rounds: number; round_rest_seconds: number; elapsed_seconds: number; completed_under_cap: boolean; rounds_completed: number; partial_round_reps: number; minutes_completed: number; highest_rung: number; perceived_effort: number; scored_at: string; prescriptions: Json }[]
      }
      constraints_in_force: {
        Args: {
          p_user_id: string
          p_session_id?: string | null
        }
        Returns: Database['public']['Tables']['user_constraints']['Row'][]
      }
      generation_candidate_sets: {
        Args: {
          p_user_id: string
          p_focus: Database['public']['Enums']['session_focus']
          p_location_id?: string | null
          p_session_id?: string | null
          p_floor?: number | null
        }
        Returns: { section: Database['public']['Enums']['section_type']; relaxed: boolean; candidates: Json }[]
      }
      generation_candidates: {
        Args: {
          p_user_id: string
          p_focus: Database['public']['Enums']['session_focus']
          p_section: Database['public']['Enums']['section_type']
          p_available_equipment: string[]
          p_session_id?: string | null
          p_relax_patterns?: boolean | null
        }
        Returns: { exercise_id: string; name: string; movement_patterns: Database['public']['Enums']['movement_pattern'][]; primary_patterns: Database['public']['Enums']['movement_pattern'][]; exercise_role: Database['public']['Enums']['exercise_role']; component_movements: string[]; muscles: Json; can_be_primary: boolean; usable_equipment: string[] }[]
      }
      generation_equipment: {
        Args: {
          p_user_id: string
          p_location_id?: string | null
        }
        Returns: string[]
      }
      generation_sections: {
        Args: {
          p_user_id: string
        }
        Returns: Database['public']['Enums']['section_type'][]
      }
      insert_prescription: {
        Args: {
          p_block_id: string
          p_order_index: number
          p_slot_id: string
          p_replaces_id: string
          p_origin: Database['public']['Enums']['prescription_origin']
          p_prescription: Json
        }
        Returns: string
      }
      mark_rest_day: {
        Args: {
          p_day: string
          p_reason: Database['public']['Enums']['rest_day_reason']
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['rest_days']['Row']
      }
      persist_session: {
        Args: {
          p_user_id: string
          p_session: Json
        }
        Returns: Json
      }
      record_favorite_completion: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      resume_session: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      save_favorite: {
        Args: {
          p_user_id: string
          p_favorite: Json
        }
        Returns: Json
      }
      save_location: {
        Args: {
          p_name: string
          p_tier: Database['public']['Enums']['equipment_tier']
          p_equipment?: string[] | null
          p_location_id?: string | null
        }
        Returns: Json
      }
      session_as_generated: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      session_as_intended_at_start: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      session_as_performed: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      session_reconstruction: {
        Args: {
          p_session_id: string
          p_kind: Database['public']['Enums']['reconstruction_kind']
        }
        Returns: Json
      }
      session_snapshot: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      session_state: {
        Args: {
          p_started_at: string
          p_completed_at: string
          p_abandoned_at: string
        }
        Returns: Database['public']['Enums']['session_state']
      }
      set_default_location: {
        Args: {
          p_location_id: string
        }
        Returns: Json
      }
      set_load_anchors: {
        Args: {
          p_user_id: string
          p_anchors: Json
        }
        Returns: Database['public']['Tables']['load_anchors']['Row'][]
      }
      start_session: {
        Args: {
          p_session_id: string
        }
        Returns: Json
      }
      streak_sessions: {
        Args: {
          p_user_id: string
          p_before?: string | null
          p_limit?: number | null
        }
        Returns: { session_id: string; completed_at: string; counts_for_streak: boolean }[]
      }
      swap_session_block: {
        Args: {
          p_block_id: string
          p_revisions: Json
        }
        Returns: Json
      }
      swap_session_exercise: {
        Args: {
          p_workout_exercise_id: string
          p_prescription: Json
        }
        Returns: Json
      }
      usable_equipment: {
        Args: {
          p_user_id: string
          p_options: string[]
          p_available: string[]
          p_session_id?: string | null
        }
        Returns: string[]
      }
    }
    Enums: {
      anchor_confidence: 'low' | 'medium' | 'high'
      constraint_action: 'exclude' | 'avoid' | 'prefer_not'
      constraint_persistence: 'session' | 'persistent'
      constraint_scope: 'exercise' | 'movement_pattern' | 'equipment'
      distance_unit: 'm' | 'km' | 'ft' | 'mi'
      equipment_tier: 'minimal' | 'home' | 'building' | 'full'
      execution_status: 'not_started' | 'completed' | 'skipped'
      exercise_role: 'compound_lift' | 'accessory' | 'activation' | 'mobility' | 'conditioning' | 'stability' | 'cardio'
      experience_level: 'new' | 'some' | 'confident'
      goal_preset: 'strength' | 'hypertrophy' | 'conditioning' | 'balanced' | 'active_recovery'
      load_guidance: 'percent_1rm' | 'rir' | 'bodyweight' | 'prior_session' | 'absolute' | 'none'
      movement_pattern: 'squat' | 'hinge' | 'press' | 'pull' | 'power' | 'unilateral' | 'conditioning'
      muscle_role: 'primary' | 'synergist' | 'stabilizer'
      prescription_modality: 'reps' | 'time' | 'distance'
      prescription_origin: 'generated' | 'revised'
      reconstruction_kind: 'generated' | 'intended_at_start' | 'performed'
      rep_scheme: 'fixed' | 'ladder_up' | 'ladder_down' | 'pyramid' | 'inverse' | 'n_plus_one' | 'ladder_fixed_interval'
      rest_day_reason: 'rest' | 'injury' | 'sick' | 'vacation'
      revision_status: 'active' | 'superseded'
      section_type: 'warmup' | 'mobility' | 'primary_lift' | 'accessory' | 'skill_power' | 'carries' | 'core' | 'stability_balance' | 'conditioning' | 'cooldown'
      session_focus: 'upper_body' | 'lower_body' | 'full_body' | 'power'
      session_state: 'prescribed' | 'active' | 'completed' | 'abandoned'
      structure_type: 'standard' | 'superset' | 'circuit' | 'emom' | 'amrap' | 'for_time'
      target_kind: 'fixed' | 'range' | 'sequence'
      timer_contract: 'none' | 'count_up' | 'countdown' | 'interval' | 'per_minute'
      weight_unit: 'lb' | 'kg'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/**
 * The schema also declares views. They are named, not typed: a view's column
 * types come from the planner rather than from its SQL text, and this
 * generator has no database to ask. The issue that first reads one declares
 * its row; naming them here means a view added later fails the drift check
 * instead of arriving unnoticed.
 */
export type ViewName = 'exercise_catalog' | 'exercise_pattern_ranked' | 'exercise_patterns' | 'session_performed'

type PublicSchema = Database['public']

export type TableName = keyof PublicSchema['Tables']
export type FunctionName = keyof PublicSchema['Functions']
export type EnumName = keyof PublicSchema['Enums']

export type Tables<T extends TableName> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update']
export type Enums<T extends EnumName> = PublicSchema['Enums'][T]
export type FunctionArgs<T extends FunctionName> = PublicSchema['Functions'][T]['Args']
export type FunctionReturns<T extends FunctionName> = PublicSchema['Functions'][T]['Returns']

/** The enum values at runtime, for a select control or a validator. */
export const Constants = {
  public: {
    Enums: {
      anchor_confidence: ['low', 'medium', 'high'],
      constraint_action: ['exclude', 'avoid', 'prefer_not'],
      constraint_persistence: ['session', 'persistent'],
      constraint_scope: ['exercise', 'movement_pattern', 'equipment'],
      distance_unit: ['m', 'km', 'ft', 'mi'],
      equipment_tier: ['minimal', 'home', 'building', 'full'],
      execution_status: ['not_started', 'completed', 'skipped'],
      exercise_role: ['compound_lift', 'accessory', 'activation', 'mobility', 'conditioning', 'stability', 'cardio'],
      experience_level: ['new', 'some', 'confident'],
      goal_preset: ['strength', 'hypertrophy', 'conditioning', 'balanced', 'active_recovery'],
      load_guidance: ['percent_1rm', 'rir', 'bodyweight', 'prior_session', 'absolute', 'none'],
      movement_pattern: ['squat', 'hinge', 'press', 'pull', 'power', 'unilateral', 'conditioning'],
      muscle_role: ['primary', 'synergist', 'stabilizer'],
      prescription_modality: ['reps', 'time', 'distance'],
      prescription_origin: ['generated', 'revised'],
      reconstruction_kind: ['generated', 'intended_at_start', 'performed'],
      rep_scheme: ['fixed', 'ladder_up', 'ladder_down', 'pyramid', 'inverse', 'n_plus_one', 'ladder_fixed_interval'],
      rest_day_reason: ['rest', 'injury', 'sick', 'vacation'],
      revision_status: ['active', 'superseded'],
      section_type: ['warmup', 'mobility', 'primary_lift', 'accessory', 'skill_power', 'carries', 'core', 'stability_balance', 'conditioning', 'cooldown'],
      session_focus: ['upper_body', 'lower_body', 'full_body', 'power'],
      session_state: ['prescribed', 'active', 'completed', 'abandoned'],
      structure_type: ['standard', 'superset', 'circuit', 'emom', 'amrap', 'for_time'],
      target_kind: ['fixed', 'range', 'sequence'],
      timer_contract: ['none', 'count_up', 'countdown', 'interval', 'per_minute'],
      weight_unit: ['lb', 'kg'],
    },
  },
} as const
