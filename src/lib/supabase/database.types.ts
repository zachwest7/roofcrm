export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Enums: {
      workflow_mode: "pre_quote_screening" | "quote_ready_review";
      property_status: "draft" | "needs_review" | "approved" | "exported";
      measurement_status: "needs_review" | "ready_for_approval" | "approved";
      pitch_class: "low" | "medium" | "steep" | "unknown";
      complexity_class: "simple" | "moderate" | "complex";
      evidence_source_type: "manual" | "public_data" | "provider_estimate" | "paid_api";
      risk_severity: "low" | "medium" | "high";
      audit_event_type: "property_created" | "draft_generated" | "manual_edit" | "approved" | "exported";
    };
    Tables: {
      properties: {
        Row: {
          id: string;
          address: string;
          customer_notes: string;
          job_notes: string;
          include_garage: boolean;
          include_shed: boolean;
          workflow_mode: Database["public"]["Enums"]["workflow_mode"];
          status: Database["public"]["Enums"]["property_status"];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          address: string;
          customer_notes?: string;
          job_notes?: string;
          include_garage?: boolean;
          include_shed?: boolean;
          workflow_mode?: Database["public"]["Enums"]["workflow_mode"];
          status?: Database["public"]["Enums"]["property_status"];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [];
      };
      measurement_drafts: {
        Row: {
          id: string;
          property_id: string;
          provider: string;
          status: Database["public"]["Enums"]["measurement_status"];
          roof_squares: number;
          pitch_class: Database["public"]["Enums"]["pitch_class"];
          waste_percent: number;
          complexity_class: Database["public"]["Enums"]["complexity_class"];
          confidence_score: number;
          included_structures: string[];
          assumptions: string[];
          raw_provider_payload: Json;
          accuracy_min_percent: number;
          accuracy_max_percent: number;
          source_stack_quality: string;
          source_disagreement_percent: number | null;
          generated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          provider: string;
          status?: Database["public"]["Enums"]["measurement_status"];
          roof_squares: number;
          pitch_class: Database["public"]["Enums"]["pitch_class"];
          waste_percent: number;
          complexity_class: Database["public"]["Enums"]["complexity_class"];
          confidence_score: number;
          included_structures?: string[];
          assumptions?: string[];
          raw_provider_payload?: Json;
          accuracy_min_percent?: number;
          accuracy_max_percent?: number;
          source_stack_quality?: string;
          source_disagreement_percent?: number | null;
          generated_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["measurement_drafts"]["Insert"]>;
        Relationships: [];
      };
      measurement_evidence: {
        Row: {
          id: string;
          property_id: string;
          draft_id: string | null;
          source_type: Database["public"]["Enums"]["evidence_source_type"];
          label: string;
          detail: string;
          source_url: string | null;
          confidence_impact: number;
          captured_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          draft_id?: string | null;
          source_type: Database["public"]["Enums"]["evidence_source_type"];
          label: string;
          detail?: string;
          source_url?: string | null;
          confidence_impact?: number;
          captured_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["measurement_evidence"]["Insert"]>;
        Relationships: [];
      };
      measurement_source_runs: {
        Row: {
          id: string;
          property_id: string;
          draft_id: string | null;
          source_code: string;
          source_label: string;
          source_status: string;
          source_type: Database["public"]["Enums"]["evidence_source_type"];
          source_role: string;
          detail: string;
          expected_accuracy_min_percent: number | null;
          expected_accuracy_max_percent: number | null;
          payload: Json;
          checked_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          draft_id?: string | null;
          source_code: string;
          source_label: string;
          source_status: string;
          source_type: Database["public"]["Enums"]["evidence_source_type"];
          source_role: string;
          detail?: string;
          expected_accuracy_min_percent?: number | null;
          expected_accuracy_max_percent?: number | null;
          payload?: Json;
          checked_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["measurement_source_runs"]["Insert"]>;
        Relationships: [];
      };
      measurement_risk_flags: {
        Row: {
          id: string;
          property_id: string;
          draft_id: string | null;
          code: string;
          label: string;
          severity: Database["public"]["Enums"]["risk_severity"];
          detail: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          draft_id?: string | null;
          code: string;
          label: string;
          severity: Database["public"]["Enums"]["risk_severity"];
          detail?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["measurement_risk_flags"]["Insert"]>;
        Relationships: [];
      };
      measurement_approvals: {
        Row: {
          id: string;
          property_id: string;
          draft_id: string | null;
          approved_roof_squares: number;
          approved_pitch_class: Database["public"]["Enums"]["pitch_class"];
          approved_waste_percent: number;
          approved_complexity_class: Database["public"]["Enums"]["complexity_class"];
          confidence_score: number;
          included_structures: string[];
          reviewer_name: string;
          reviewer_notes: string;
          approved_by: string | null;
          approved_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          draft_id?: string | null;
          approved_roof_squares: number;
          approved_pitch_class: Database["public"]["Enums"]["pitch_class"];
          approved_waste_percent: number;
          approved_complexity_class: Database["public"]["Enums"]["complexity_class"];
          confidence_score: number;
          included_structures?: string[];
          reviewer_name: string;
          reviewer_notes?: string;
          approved_by?: string | null;
          approved_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["measurement_approvals"]["Insert"]>;
        Relationships: [];
      };
      measurement_audit_events: {
        Row: {
          id: string;
          property_id: string;
          draft_id: string | null;
          approval_id: string | null;
          event_type: Database["public"]["Enums"]["audit_event_type"];
          actor_name: string;
          summary: string;
          payload: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          draft_id?: string | null;
          approval_id?: string | null;
          event_type: Database["public"]["Enums"]["audit_event_type"];
          actor_name?: string;
          summary: string;
          payload?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["measurement_audit_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
