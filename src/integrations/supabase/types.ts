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
      admin_broadcast_recipients: {
        Row: {
          broadcast_id: string
          error_message: string | null
          id: string
          seller_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          broadcast_id: string
          error_message?: string | null
          id?: string
          seller_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          broadcast_id?: string
          error_message?: string | null
          id?: string
          seller_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "admin_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_broadcasts: {
        Row: {
          admin_id: string
          completed_at: string | null
          created_at: string | null
          failed_count: number | null
          id: string
          interval_seconds: number | null
          message: string
          sent_count: number | null
          started_at: string | null
          status: string
          total_recipients: number | null
        }
        Insert: {
          admin_id: string
          completed_at?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          interval_seconds?: number | null
          message: string
          sent_count?: number | null
          started_at?: string | null
          status?: string
          total_recipients?: number | null
        }
        Update: {
          admin_id?: string
          completed_at?: string | null
          created_at?: string | null
          failed_count?: number | null
          id?: string
          interval_seconds?: number | null
          message?: string
          sent_count?: number | null
          started_at?: string | null
          status?: string
          total_recipients?: number | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      backup_import_jobs: {
        Row: {
          admin_id: string
          created_at: string
          errors: Json | null
          id: string
          mode: string
          modules: Json | null
          processed_items: number
          progress: number
          restored: Json | null
          status: string
          total_items: number
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          admin_id: string
          created_at?: string
          errors?: Json | null
          id?: string
          mode?: string
          modules?: Json | null
          processed_items?: number
          progress?: number
          restored?: Json | null
          status?: string
          total_items?: number
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          admin_id?: string
          created_at?: string
          errors?: Json | null
          id?: string
          mode?: string
          modules?: Json | null
          processed_items?: number
          progress?: number
          restored?: Json | null
          status?: string
          total_items?: number
          updated_at?: string
          warnings?: Json | null
        }
        Relationships: []
      }
      bills_to_pay: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          due_date: string
          id: string
          is_paid: boolean | null
          notes: string | null
          paid_at: string | null
          recipient_name: string
          recipient_pix: string | null
          recipient_whatsapp: string | null
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description: string
          due_date: string
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          recipient_name: string
          recipient_pix?: string | null
          recipient_whatsapp?: string | null
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          due_date?: string
          id?: string
          is_paid?: boolean | null
          notes?: string | null
          paid_at?: string | null
          recipient_name?: string
          recipient_pix?: string | null
          recipient_whatsapp?: string | null
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_contacts: {
        Row: {
          client_id: string | null
          contact_status: string | null
          created_at: string | null
          first_interaction_at: string | null
          id: string
          interaction_count: number | null
          last_buttons_sent_at: string | null
          last_interaction_at: string | null
          last_list_sent_at: string | null
          last_response_at: string | null
          name: string | null
          phone: string
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          contact_status?: string | null
          created_at?: string | null
          first_interaction_at?: string | null
          id?: string
          interaction_count?: number | null
          last_buttons_sent_at?: string | null
          last_interaction_at?: string | null
          last_list_sent_at?: string | null
          last_response_at?: string | null
          name?: string | null
          phone: string
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          contact_status?: string | null
          created_at?: string | null
          first_interaction_at?: string | null
          id?: string
          interaction_count?: number | null
          last_buttons_sent_at?: string | null
          last_interaction_at?: string | null
          last_list_sent_at?: string | null
          last_response_at?: string | null
          name?: string | null
          phone?: string
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flow_nodes: {
        Row: {
          created_at: string | null
          description: string | null
          flow_id: string
          id: string
          is_active: boolean | null
          option_number: string
          parent_node_id: string | null
          response_content: Json | null
          response_type: string | null
          seller_id: string
          sort_order: number | null
          template_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          flow_id: string
          id?: string
          is_active?: boolean | null
          option_number: string
          parent_node_id?: string | null
          response_content?: Json | null
          response_type?: string | null
          seller_id: string
          sort_order?: number | null
          template_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          flow_id?: string
          id?: string
          is_active?: boolean | null
          option_number?: string
          parent_node_id?: string | null
          response_content?: Json | null
          response_type?: string | null
          seller_id?: string
          sort_order?: number | null
          template_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flow_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flow_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flow_nodes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "chatbot_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flow_sessions: {
        Row: {
          awaiting_human: boolean | null
          contact_phone: string
          created_at: string | null
          current_flow_id: string | null
          current_node_id: string | null
          id: string
          is_active: boolean | null
          last_interaction_at: string | null
          seller_id: string
          session_started_at: string | null
        }
        Insert: {
          awaiting_human?: boolean | null
          contact_phone: string
          created_at?: string | null
          current_flow_id?: string | null
          current_node_id?: string | null
          id?: string
          is_active?: boolean | null
          last_interaction_at?: string | null
          seller_id: string
          session_started_at?: string | null
        }
        Update: {
          awaiting_human?: boolean | null
          contact_phone?: string
          created_at?: string | null
          current_flow_id?: string | null
          current_node_id?: string | null
          id?: string
          is_active?: boolean | null
          last_interaction_at?: string | null
          seller_id?: string
          session_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flow_sessions_current_flow_id_fkey"
            columns: ["current_flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flow_sessions_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flows: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_main_menu: boolean | null
          name: string
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_main_menu?: boolean | null
          name: string
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_main_menu?: boolean | null
          name?: string
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_interactions: {
        Row: {
          block_reason: string | null
          button_clicked: string | null
          contact_id: string | null
          id: string
          incoming_message: string | null
          list_selected: string | null
          phone: string
          response_sent: Json | null
          response_type: string | null
          rule_id: string | null
          seller_id: string
          sent_at: string | null
          was_blocked: boolean | null
        }
        Insert: {
          block_reason?: string | null
          button_clicked?: string | null
          contact_id?: string | null
          id?: string
          incoming_message?: string | null
          list_selected?: string | null
          phone: string
          response_sent?: Json | null
          response_type?: string | null
          rule_id?: string | null
          seller_id: string
          sent_at?: string | null
          was_blocked?: boolean | null
        }
        Update: {
          block_reason?: string | null
          button_clicked?: string | null
          contact_id?: string | null
          id?: string
          incoming_message?: string | null
          list_selected?: string | null
          phone?: string
          response_sent?: Json | null
          response_type?: string | null
          rule_id?: string | null
          seller_id?: string
          sent_at?: string | null
          was_blocked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chatbot_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_interactions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "chatbot_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_rules: {
        Row: {
          contact_filter: string | null
          cooldown_hours: number | null
          cooldown_mode: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_global_trigger: boolean | null
          name: string
          priority: number | null
          response_content: Json
          response_type: string | null
          seller_id: string
          template_id: string | null
          trigger_text: string
          updated_at: string | null
        }
        Insert: {
          contact_filter?: string | null
          cooldown_hours?: number | null
          cooldown_mode?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_global_trigger?: boolean | null
          name: string
          priority?: number | null
          response_content?: Json
          response_type?: string | null
          seller_id: string
          template_id?: string | null
          trigger_text: string
          updated_at?: string | null
        }
        Update: {
          contact_filter?: string | null
          cooldown_hours?: number | null
          cooldown_mode?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_global_trigger?: boolean | null
          name?: string
          priority?: number | null
          response_content?: Json
          response_type?: string | null
          seller_id?: string
          template_id?: string | null
          trigger_text?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_send_logs: {
        Row: {
          api_response: string | null
          api_status_code: number | null
          contact_phone: string
          created_at: string | null
          error_message: string | null
          id: string
          instance_name: string
          message_type: string
          seller_id: string
          success: boolean | null
        }
        Insert: {
          api_response?: string | null
          api_status_code?: number | null
          contact_phone: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          instance_name: string
          message_type: string
          seller_id: string
          success?: boolean | null
        }
        Update: {
          api_response?: string | null
          api_status_code?: number | null
          contact_phone?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          instance_name?: string
          message_type?: string
          seller_id?: string
          success?: boolean | null
        }
        Relationships: []
      }
      chatbot_settings: {
        Row: {
          created_at: string | null
          id: string
          ignore_groups: boolean | null
          ignore_own_messages: boolean | null
          is_enabled: boolean | null
          response_delay_max: number | null
          response_delay_min: number | null
          seller_id: string
          typing_duration_max: number | null
          typing_duration_min: number | null
          typing_enabled: boolean | null
          updated_at: string | null
          webhook_configured: boolean | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ignore_groups?: boolean | null
          ignore_own_messages?: boolean | null
          is_enabled?: boolean | null
          response_delay_max?: number | null
          response_delay_min?: number | null
          seller_id: string
          typing_duration_max?: number | null
          typing_duration_min?: number | null
          typing_enabled?: boolean | null
          updated_at?: string | null
          webhook_configured?: boolean | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ignore_groups?: boolean | null
          ignore_own_messages?: boolean | null
          is_enabled?: boolean | null
          response_delay_max?: number | null
          response_delay_min?: number | null
          seller_id?: string
          typing_duration_max?: number | null
          typing_duration_min?: number | null
          typing_enabled?: boolean | null
          updated_at?: string | null
          webhook_configured?: boolean | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      chatbot_template_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          seller_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          seller_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          seller_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_templates: {
        Row: {
          category: string | null
          contact_filter: string | null
          cooldown_hours: number | null
          cooldown_mode: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          response_content: Json
          response_type: string | null
          seller_id: string | null
          trigger_text: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          contact_filter?: string | null
          cooldown_hours?: number | null
          cooldown_mode?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          response_content?: Json
          response_type?: string | null
          seller_id?: string | null
          trigger_text: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          contact_filter?: string | null
          cooldown_hours?: number | null
          cooldown_mode?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          response_content?: Json
          response_type?: string | null
          seller_id?: string | null
          trigger_text?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      client_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          seller_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          seller_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          seller_id?: string
        }
        Relationships: []
      }
      client_external_apps: {
        Row: {
          client_id: string
          created_at: string | null
          devices: Json | null
          email: string | null
          expiration_date: string | null
          external_app_id: string
          id: string
          notes: string | null
          password: string | null
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          devices?: Json | null
          email?: string | null
          expiration_date?: string | null
          external_app_id: string
          id?: string
          notes?: string | null
          password?: string | null
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          devices?: Json | null
          email?: string | null
          expiration_date?: string | null
          external_app_id?: string
          id?: string
          notes?: string | null
          password?: string | null
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_external_apps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_external_apps_external_app_id_fkey"
            columns: ["external_app_id"]
            isOneToOne: false
            referencedRelation: "external_apps"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notification_tracking: {
        Row: {
          client_id: string
          expiration_cycle_date: string
          id: string
          notification_type: string
          seller_id: string
          sent_at: string | null
          sent_via: string | null
          service_type: string | null
        }
        Insert: {
          client_id: string
          expiration_cycle_date: string
          id?: string
          notification_type: string
          seller_id: string
          sent_at?: string | null
          sent_via?: string | null
          service_type?: string | null
        }
        Update: {
          client_id?: string
          expiration_cycle_date?: string
          id?: string
          notification_type?: string
          seller_id?: string
          sent_at?: string | null
          sent_via?: string | null
          service_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_notification_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_premium_accounts: {
        Row: {
          client_id: string
          created_at: string | null
          email: string | null
          expiration_date: string | null
          id: string
          notes: string | null
          password: string | null
          plan_name: string
          price: number | null
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email?: string | null
          expiration_date?: string | null
          id?: string
          notes?: string | null
          password?: string | null
          plan_name: string
          price?: number | null
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string | null
          expiration_date?: string | null
          id?: string
          notes?: string | null
          password?: string | null
          plan_name?: string
          price?: number | null
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          additional_servers: Json | null
          app_name: string | null
          app_type: string | null
          archived_at: string | null
          category: string | null
          created_at: string | null
          credentials_fingerprint: string | null
          device: string | null
          dns: string | null
          email: string | null
          expected_payment_date: string | null
          expiration_date: string
          gerencia_app_devices: Json | null
          gerencia_app_mac: string | null
          has_paid_apps: boolean | null
          id: string
          is_archived: boolean | null
          is_paid: boolean | null
          login: string | null
          login_2: string | null
          name: string
          notes: string | null
          paid_apps_duration: string | null
          paid_apps_email: string | null
          paid_apps_expiration: string | null
          paid_apps_password: string | null
          password: string | null
          password_2: string | null
          pending_amount: number | null
          phone: string | null
          plan_id: string | null
          plan_name: string | null
          plan_price: number | null
          premium_password: string | null
          premium_price: number | null
          referral_code: string | null
          renewed_at: string | null
          seller_id: string
          server_id: string | null
          server_id_2: string | null
          server_name: string | null
          server_name_2: string | null
          telegram: string | null
          updated_at: string | null
        }
        Insert: {
          additional_servers?: Json | null
          app_name?: string | null
          app_type?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string | null
          credentials_fingerprint?: string | null
          device?: string | null
          dns?: string | null
          email?: string | null
          expected_payment_date?: string | null
          expiration_date: string
          gerencia_app_devices?: Json | null
          gerencia_app_mac?: string | null
          has_paid_apps?: boolean | null
          id?: string
          is_archived?: boolean | null
          is_paid?: boolean | null
          login?: string | null
          login_2?: string | null
          name: string
          notes?: string | null
          paid_apps_duration?: string | null
          paid_apps_email?: string | null
          paid_apps_expiration?: string | null
          paid_apps_password?: string | null
          password?: string | null
          password_2?: string | null
          pending_amount?: number | null
          phone?: string | null
          plan_id?: string | null
          plan_name?: string | null
          plan_price?: number | null
          premium_password?: string | null
          premium_price?: number | null
          referral_code?: string | null
          renewed_at?: string | null
          seller_id: string
          server_id?: string | null
          server_id_2?: string | null
          server_name?: string | null
          server_name_2?: string | null
          telegram?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_servers?: Json | null
          app_name?: string | null
          app_type?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string | null
          credentials_fingerprint?: string | null
          device?: string | null
          dns?: string | null
          email?: string | null
          expected_payment_date?: string | null
          expiration_date?: string
          gerencia_app_devices?: Json | null
          gerencia_app_mac?: string | null
          has_paid_apps?: boolean | null
          id?: string
          is_archived?: boolean | null
          is_paid?: boolean | null
          login?: string | null
          login_2?: string | null
          name?: string
          notes?: string | null
          paid_apps_duration?: string | null
          paid_apps_email?: string | null
          paid_apps_expiration?: string | null
          paid_apps_password?: string | null
          password?: string | null
          password_2?: string | null
          pending_amount?: number | null
          phone?: string | null
          plan_id?: string | null
          plan_name?: string | null
          plan_price?: number | null
          premium_password?: string | null
          premium_price?: number | null
          referral_code?: string | null
          renewed_at?: string | null
          seller_id?: string
          server_id?: string | null
          server_id_2?: string | null
          server_name?: string | null
          server_name_2?: string | null
          telegram?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          id: string
          instance_name: string
          is_resolved: boolean | null
          message: string
          resolved_at: string | null
          seller_id: string
          severity: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          id?: string
          instance_name: string
          is_resolved?: boolean | null
          message: string
          resolved_at?: string | null
          seller_id: string
          severity?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          id?: string
          instance_name?: string
          is_resolved?: boolean | null
          message?: string
          resolved_at?: string | null
          seller_id?: string
          severity?: string | null
        }
        Relationships: []
      }
      connection_logs: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          event_source: string
          event_type: string
          id: string
          instance_name: string
          is_connected: boolean | null
          metadata: Json | null
          new_state: string | null
          previous_state: string | null
          seller_id: string
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_source?: string
          event_type: string
          id?: string
          instance_name: string
          is_connected?: boolean | null
          metadata?: Json | null
          new_state?: string | null
          previous_state?: string | null
          seller_id: string
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          event_source?: string
          event_type?: string
          id?: string
          instance_name?: string
          is_connected?: boolean | null
          metadata?: Json | null
          new_state?: string | null
          previous_state?: string | null
          seller_id?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          current_uses: number | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_plan_value: number | null
          name: string
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          current_uses?: number | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_plan_value?: number | null
          name: string
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          current_uses?: number | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_plan_value?: number | null
          name?: string
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      custom_products: {
        Row: {
          created_at: string | null
          download_url: string | null
          downloader_code: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          download_url?: string | null
          downloader_code?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          download_url?: string | null
          downloader_code?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      default_server_icons: {
        Row: {
          created_at: string
          icon_url: string
          id: string
          name: string
          name_normalized: string
          panel_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon_url: string
          id?: string
          name: string
          name_normalized: string
          panel_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon_url?: string
          id?: string
          name?: string
          name_normalized?: string
          panel_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      external_apps: {
        Row: {
          auth_type: string
          cost: number | null
          created_at: string | null
          download_url: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          seller_id: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          auth_type?: string
          cost?: number | null
          created_at?: string | null
          download_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          seller_id: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          auth_type?: string
          cost?: number | null
          created_at?: string | null
          download_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          seller_id?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempt_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          attempt_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          attempt_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      message_history: {
        Row: {
          client_id: string
          id: string
          message_content: string
          message_type: string
          phone: string
          seller_id: string
          sent_at: string | null
          template_id: string | null
        }
        Insert: {
          client_id: string
          id?: string
          message_content: string
          message_type: string
          phone: string
          seller_id: string
          sent_at?: string | null
          template_id?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          message_content?: string
          message_type?: string
          phone?: string
          seller_id?: string
          sent_at?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          client_id: string
          created_at: string | null
          error_message: string | null
          id: string
          message_type: string
          priority: number
          retry_count: number | null
          scheduled_at: string | null
          seller_id: string
          sent_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          priority?: number
          retry_count?: number | null
          scheduled_at?: string | null
          seller_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          priority?: number
          retry_count?: number | null
          scheduled_at?: string | null
          seller_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_profits: {
        Row: {
          active_clients: number
          bills_costs: number
          closed_at: string | null
          created_at: string
          id: string
          month: number
          net_profit: number
          revenue: number
          seller_id: string
          server_costs: number
          updated_at: string
          year: number
        }
        Insert: {
          active_clients?: number
          bills_costs?: number
          closed_at?: string | null
          created_at?: string
          id?: string
          month: number
          net_profit?: number
          revenue?: number
          seller_id: string
          server_costs?: number
          updated_at?: string
          year: number
        }
        Update: {
          active_clients?: number
          bills_costs?: number
          closed_at?: string | null
          created_at?: string
          id?: string
          month?: number
          net_profit?: number
          revenue?: number
          seller_id?: string
          server_costs?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      panel_clients: {
        Row: {
          assigned_at: string | null
          client_id: string
          id: string
          panel_id: string
          seller_id: string
          slot_type: string
        }
        Insert: {
          assigned_at?: string | null
          client_id: string
          id?: string
          panel_id: string
          seller_id: string
          slot_type?: string
        }
        Update: {
          assigned_at?: string | null
          client_id?: string
          id?: string
          panel_id?: string
          seller_id?: string
          slot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "panel_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_clients_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "shared_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "panel_clients_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "shared_panels_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          duration_days: number
          id: string
          is_active: boolean | null
          name: string
          price: number
          screens: number | null
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
          screens?: number | null
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          screens?: number | null
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          is_permanent: boolean | null
          needs_password_update: boolean | null
          notification_days_before: number | null
          pix_key: string | null
          subscription_expires_at: string | null
          tutorial_visto: boolean | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          needs_password_update?: boolean | null
          notification_days_before?: number | null
          pix_key?: string | null
          subscription_expires_at?: string | null
          tutorial_visto?: boolean | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          needs_password_update?: boolean | null
          notification_days_before?: number | null
          pix_key?: string | null
          subscription_expires_at?: string | null
          tutorial_visto?: boolean | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string | null
          discount_percentage: number | null
          id: string
          referred_client_id: string
          referrer_client_id: string
          seller_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          referred_client_id: string
          referrer_client_id: string
          seller_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          discount_percentage?: number | null
          id?: string
          referred_client_id?: string
          referrer_client_id?: string
          seller_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_client_id_fkey"
            columns: ["referred_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_client_id_fkey"
            columns: ["referrer_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_notification_tracking: {
        Row: {
          admin_id: string
          expiration_cycle_date: string
          id: string
          notification_type: string
          reseller_id: string
          sent_at: string | null
        }
        Insert: {
          admin_id: string
          expiration_cycle_date: string
          id?: string
          notification_type: string
          reseller_id: string
          sent_at?: string | null
        }
        Update: {
          admin_id?: string
          expiration_cycle_date?: string
          id?: string
          notification_type?: string
          reseller_id?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      seller_queue_settings: {
        Row: {
          catch_up_completed: boolean | null
          catch_up_mode: boolean | null
          created_at: string | null
          end_hour: number | null
          id: string
          interval_seconds: number | null
          is_enabled: boolean | null
          last_processed_at: string | null
          seller_id: string
          start_hour: number | null
          updated_at: string | null
        }
        Insert: {
          catch_up_completed?: boolean | null
          catch_up_mode?: boolean | null
          created_at?: string | null
          end_hour?: number | null
          id?: string
          interval_seconds?: number | null
          is_enabled?: boolean | null
          last_processed_at?: string | null
          seller_id: string
          start_hour?: number | null
          updated_at?: string | null
        }
        Update: {
          catch_up_completed?: boolean | null
          catch_up_mode?: boolean | null
          created_at?: string | null
          end_hour?: number | null
          id?: string
          interval_seconds?: number | null
          is_enabled?: boolean | null
          last_processed_at?: string | null
          seller_id?: string
          start_hour?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      server_apps: {
        Row: {
          app_type: string
          created_at: string | null
          download_url: string | null
          downloader_code: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          seller_id: string
          server_id: string
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          app_type?: string
          created_at?: string | null
          download_url?: string | null
          downloader_code?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          seller_id: string
          server_id: string
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          app_type?: string
          created_at?: string | null
          download_url?: string | null
          downloader_code?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          seller_id?: string
          server_id?: string
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "server_apps_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          created_at: string | null
          credit_price: number | null
          credit_value: number | null
          icon_url: string | null
          id: string
          iptv_per_credit: number | null
          is_active: boolean | null
          is_credit_based: boolean | null
          monthly_cost: number | null
          name: string
          notes: string | null
          p2p_per_credit: number | null
          panel_url: string | null
          seller_id: string
          total_credits: number | null
          total_screens_per_credit: number | null
          updated_at: string | null
          used_credits: number | null
        }
        Insert: {
          created_at?: string | null
          credit_price?: number | null
          credit_value?: number | null
          icon_url?: string | null
          id?: string
          iptv_per_credit?: number | null
          is_active?: boolean | null
          is_credit_based?: boolean | null
          monthly_cost?: number | null
          name: string
          notes?: string | null
          p2p_per_credit?: number | null
          panel_url?: string | null
          seller_id: string
          total_credits?: number | null
          total_screens_per_credit?: number | null
          updated_at?: string | null
          used_credits?: number | null
        }
        Update: {
          created_at?: string | null
          credit_price?: number | null
          credit_value?: number | null
          icon_url?: string | null
          id?: string
          iptv_per_credit?: number | null
          is_active?: boolean | null
          is_credit_based?: boolean | null
          monthly_cost?: number | null
          name?: string
          notes?: string | null
          p2p_per_credit?: number | null
          panel_url?: string | null
          seller_id?: string
          total_credits?: number | null
          total_screens_per_credit?: number | null
          updated_at?: string | null
          used_credits?: number | null
        }
        Relationships: []
      }
      shared_panels: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          iptv_per_credit: number | null
          is_active: boolean | null
          login: string | null
          monthly_cost: number
          name: string
          notes: string | null
          p2p_per_credit: number | null
          panel_type: string
          password: string | null
          seller_id: string
          total_slots: number
          updated_at: string | null
          url: string | null
          used_iptv_slots: number
          used_p2p_slots: number
          used_slots: number
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          iptv_per_credit?: number | null
          is_active?: boolean | null
          login?: string | null
          monthly_cost?: number
          name: string
          notes?: string | null
          p2p_per_credit?: number | null
          panel_type?: string
          password?: string | null
          seller_id: string
          total_slots?: number
          updated_at?: string | null
          url?: string | null
          used_iptv_slots?: number
          used_p2p_slots?: number
          used_slots?: number
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          iptv_per_credit?: number | null
          is_active?: boolean | null
          login?: string | null
          monthly_cost?: number
          name?: string
          notes?: string | null
          p2p_per_credit?: number | null
          panel_type?: string
          password?: string | null
          seller_id?: string
          total_slots?: number
          updated_at?: string | null
          url?: string | null
          used_iptv_slots?: number
          used_p2p_slots?: number
          used_slots?: number
        }
        Relationships: []
      }
      system_health_config: {
        Row: {
          auto_repair_enabled: boolean | null
          check_interval_seconds: number | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_repair_attempts: number | null
          notify_admin_on_critical: boolean | null
          updated_at: string | null
        }
        Insert: {
          auto_repair_enabled?: boolean | null
          check_interval_seconds?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_repair_attempts?: number | null
          notify_admin_on_critical?: boolean | null
          updated_at?: string | null
        }
        Update: {
          auto_repair_enabled?: boolean | null
          check_interval_seconds?: number | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_repair_attempts?: number | null
          notify_admin_on_critical?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_health_logs: {
        Row: {
          component_name: string
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          message: string
          repair_action: string | null
          severity: string
          was_auto_repaired: boolean | null
        }
        Insert: {
          component_name: string
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          message: string
          repair_action?: string | null
          severity?: string
          was_auto_repaired?: boolean | null
        }
        Update: {
          component_name?: string
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          message?: string
          repair_action?: string | null
          severity?: string
          was_auto_repaired?: boolean | null
        }
        Relationships: []
      }
      system_health_status: {
        Row: {
          component_name: string
          component_type: string
          consecutive_failures: number | null
          created_at: string | null
          id: string
          last_check_at: string | null
          last_error: string | null
          last_repair_at: string | null
          last_repair_success: boolean | null
          metadata: Json | null
          repair_attempts: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          component_name: string
          component_type: string
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          last_check_at?: string | null
          last_error?: string | null
          last_repair_at?: string | null
          last_repair_success?: boolean | null
          metadata?: Json | null
          repair_attempts?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          component_name?: string
          component_type?: string
          consecutive_failures?: number | null
          created_at?: string | null
          id?: string
          last_check_at?: string | null
          last_error?: string | null
          last_repair_at?: string | null
          last_repair_success?: boolean | null
          metadata?: Json | null
          repair_attempts?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_repair_actions: {
        Row: {
          action_config: Json | null
          action_name: string
          action_type: string
          component_name: string
          created_at: string | null
          executions_today: number | null
          id: string
          is_active: boolean | null
          is_safe: boolean | null
          last_execution_at: string | null
          max_daily_executions: number | null
          requires_confirmation: boolean | null
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_name: string
          action_type: string
          component_name: string
          created_at?: string | null
          executions_today?: number | null
          id?: string
          is_active?: boolean | null
          is_safe?: boolean | null
          last_execution_at?: string | null
          max_daily_executions?: number | null
          requires_confirmation?: boolean | null
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_name?: string
          action_type?: string
          component_name?: string
          created_at?: string | null
          executions_today?: number | null
          id?: string
          is_active?: boolean | null
          is_safe?: boolean | null
          last_execution_at?: string | null
          max_daily_executions?: number | null
          requires_confirmation?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tutorials: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          order_index: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          youtube_url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          youtube_url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          order_index?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          youtube_url?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_global_config: {
        Row: {
          api_token: string
          api_url: string
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          api_token?: string
          api_url?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          api_token?: string
          api_url?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_seller_instances: {
        Row: {
          auto_configured_at: string | null
          auto_send_enabled: boolean | null
          blocked_at: string | null
          blocked_reason: string | null
          configuration_error: string | null
          connection_source: string | null
          created_at: string | null
          heartbeat_failures: number | null
          id: string
          instance_blocked: boolean
          instance_link: string | null
          instance_name: string
          is_connected: boolean | null
          last_connection_check: string | null
          last_evolution_state: string | null
          last_heartbeat_at: string | null
          last_reconnect_attempt_at: string | null
          offline_since: string | null
          original_instance_name: string | null
          plan_expires_at: string | null
          plan_status: string
          reconnect_attempts: number | null
          seller_id: string
          session_id: string | null
          session_valid: boolean | null
          updated_at: string | null
          webhook_auto_configured: boolean | null
        }
        Insert: {
          auto_configured_at?: string | null
          auto_send_enabled?: boolean | null
          blocked_at?: string | null
          blocked_reason?: string | null
          configuration_error?: string | null
          connection_source?: string | null
          created_at?: string | null
          heartbeat_failures?: number | null
          id?: string
          instance_blocked?: boolean
          instance_link?: string | null
          instance_name?: string
          is_connected?: boolean | null
          last_connection_check?: string | null
          last_evolution_state?: string | null
          last_heartbeat_at?: string | null
          last_reconnect_attempt_at?: string | null
          offline_since?: string | null
          original_instance_name?: string | null
          plan_expires_at?: string | null
          plan_status?: string
          reconnect_attempts?: number | null
          seller_id: string
          session_id?: string | null
          session_valid?: boolean | null
          updated_at?: string | null
          webhook_auto_configured?: boolean | null
        }
        Update: {
          auto_configured_at?: string | null
          auto_send_enabled?: boolean | null
          blocked_at?: string | null
          blocked_reason?: string | null
          configuration_error?: string | null
          connection_source?: string | null
          created_at?: string | null
          heartbeat_failures?: number | null
          id?: string
          instance_blocked?: boolean
          instance_link?: string | null
          instance_name?: string
          is_connected?: boolean | null
          last_connection_check?: string | null
          last_evolution_state?: string | null
          last_heartbeat_at?: string | null
          last_reconnect_attempt_at?: string | null
          offline_since?: string | null
          original_instance_name?: string | null
          plan_expires_at?: string | null
          plan_status?: string
          reconnect_attempts?: number | null
          seller_id?: string
          session_id?: string | null
          session_valid?: boolean | null
          updated_at?: string | null
          webhook_auto_configured?: boolean | null
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          message: string
          name: string
          seller_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          message: string
          name: string
          seller_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          message?: string
          name?: string
          seller_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      shared_panels_safe: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string | null
          iptv_per_credit: number | null
          is_active: boolean | null
          login: string | null
          monthly_cost: number | null
          name: string | null
          notes: string | null
          p2p_per_credit: number | null
          panel_type: string | null
          password_status: string | null
          seller_id: string | null
          total_slots: number | null
          updated_at: string | null
          url: string | null
          used_iptv_slots: number | null
          used_p2p_slots: number | null
          used_slots: number | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          iptv_per_credit?: number | null
          is_active?: boolean | null
          login?: string | null
          monthly_cost?: number | null
          name?: string | null
          notes?: string | null
          p2p_per_credit?: number | null
          panel_type?: string | null
          password_status?: never
          seller_id?: string | null
          total_slots?: number | null
          updated_at?: string | null
          url?: string | null
          used_iptv_slots?: number | null
          used_p2p_slots?: number | null
          used_slots?: number | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          iptv_per_credit?: number | null
          is_active?: boolean | null
          login?: string | null
          monthly_cost?: number | null
          name?: string | null
          notes?: string | null
          p2p_per_credit?: number | null
          panel_type?: string | null
          password_status?: never
          seller_id?: string | null
          total_slots?: number | null
          updated_at?: string | null
          url?: string | null
          used_iptv_slots?: number | null
          used_p2p_slots?: number | null
          used_slots?: number | null
        }
        Relationships: []
      }
      whatsapp_global_config_public: {
        Row: {
          api_token_status: string | null
          api_url: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          api_token_status?: never
          api_url?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          api_token_status?: never
          api_url?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_and_block_expired_instances: {
        Args: never
        Returns: {
          blocked: boolean
          instance_name: string
          seller_email: string
          seller_id: string
        }[]
      }
      cleanup_old_connection_logs: { Args: never; Returns: number }
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      create_admin_templates: {
        Args: { admin_uuid: string }
        Returns: undefined
      }
      create_connection_alert: {
        Args: {
          p_alert_type: string
          p_instance_name: string
          p_message: string
          p_seller_id: string
          p_severity: string
        }
        Returns: string
      }
      create_default_chatbot_categories: {
        Args: { p_seller_id: string }
        Returns: undefined
      }
      create_default_plans_for_seller: {
        Args: { seller_uuid: string }
        Returns: undefined
      }
      create_default_templates_for_seller: {
        Args: { seller_uuid: string }
        Returns: undefined
      }
      create_panel_reseller_templates_for_seller: {
        Args: { seller_uuid: string }
        Returns: undefined
      }
      create_plans_for_custom_product: {
        Args: { p_product_name: string; p_seller_id: string }
        Returns: undefined
      }
      create_reseller_templates_for_seller: {
        Args: { seller_uuid: string }
        Returns: undefined
      }
      create_templates_for_custom_product: {
        Args: { p_product_name: string; p_seller_id: string }
        Returns: undefined
      }
      find_server_icon: { Args: { server_name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_blocked: { Args: { user_email: string }; Returns: boolean }
      log_connection_event: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_event_source: string
          p_event_type: string
          p_instance_name: string
          p_is_connected: boolean
          p_metadata?: Json
          p_new_state: string
          p_previous_state: string
          p_seller_id: string
        }
        Returns: string
      }
      normalize_server_name: { Args: { name: string }; Returns: string }
      unblock_seller_instance: {
        Args: { p_seller_id: string }
        Returns: boolean
      }
      update_instance_heartbeat: {
        Args: {
          p_evolution_state?: string
          p_is_connected: boolean
          p_seller_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "seller"
      discount_type: "percentage" | "fixed"
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
    Enums: {
      app_role: ["admin", "seller"],
      discount_type: ["percentage", "fixed"],
    },
  },
} as const
