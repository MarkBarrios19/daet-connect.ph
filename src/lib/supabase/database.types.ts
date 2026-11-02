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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh_key: string
          profile_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh_key: string
          profile_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh_key?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards_ledger: {
        Row: {
          created_at: string
          description: string | null
          id: string
          points: number
          profile_id: string
          ref_id: string
          source: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          points: number
          profile_id: string
          ref_id: string
          source: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          points?: number
          profile_id?: string
          ref_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_ai_messages: {
        Row: {
          cards: Json | null
          content: string
          created_at: string
          id: string
          mode: string | null
          profile_id: string
          role: string
        }
        Insert: {
          cards?: Json | null
          content: string
          created_at?: string
          id?: string
          mode?: string | null
          profile_id?: string
          role: string
        }
        Update: {
          cards?: Json | null
          content?: string
          created_at?: string
          id?: string
          mode?: string | null
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_ai_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_attractions: {
        Row: {
          address: string | null
          category: string
          created_at: string
          description: string | null
          dwell_minutes: number | null
          entrance_fee: number | null
          hours_note: string | null
          id: string
          is_active: boolean
          latitude: number | null
          location_verified: boolean
          longitude: number | null
          municipality: string
          name: string
          opening_hours: Json | null
          photo_url: string | null
          slug: string
          source: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string
          description?: string | null
          dwell_minutes?: number | null
          entrance_fee?: number | null
          hours_note?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_verified?: boolean
          longitude?: number | null
          municipality?: string
          name: string
          opening_hours?: Json | null
          photo_url?: string | null
          slug: string
          source: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string
          description?: string | null
          dwell_minutes?: number | null
          entrance_fee?: number | null
          hours_note?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          location_verified?: boolean
          longitude?: number | null
          municipality?: string
          name?: string
          opening_hours?: Json | null
          photo_url?: string | null
          slug?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      tours_booking_participants: {
        Row: {
          age: number | null
          booking_id: string
          created_at: string
          full_name: string
          id: string
          special_requirements: string | null
        }
        Insert: {
          age?: number | null
          booking_id: string
          created_at?: string
          full_name: string
          id?: string
          special_requirements?: string | null
        }
        Update: {
          age?: number | null
          booking_id?: string
          created_at?: string
          full_name?: string
          id?: string
          special_requirements?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_booking_participants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_booking_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string
          payment_status: string
          receipt_url: string | null
          transaction_reference: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method: string
          payment_status?: string
          receipt_url?: string | null
          transaction_reference?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          receipt_url?: string | null
          transaction_reference?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_bookings: {
        Row: {
          assigned_guide_id: string | null
          booking_reference: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          id: string
          number_of_pax: number
          package_id: string
          payment_status: string | null
          price_per_pax: number | null
          price_variant_id: string | null
          special_requests: string | null
          status: string
          total_amount: number
          total_paid: number | null
          tour_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_guide_id?: string | null
          booking_reference: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at?: string
          id?: string
          number_of_pax: number
          package_id: string
          payment_status?: string | null
          price_per_pax?: number | null
          price_variant_id?: string | null
          special_requests?: string | null
          status?: string
          total_amount: number
          total_paid?: number | null
          tour_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_guide_id?: string | null
          booking_reference?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          id?: string
          number_of_pax?: number
          package_id?: string
          payment_status?: string | null
          price_per_pax?: number | null
          price_variant_id?: string | null
          special_requests?: string | null
          status?: string
          total_amount?: number
          total_paid?: number | null
          tour_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_bookings_assigned_guide_id_fkey"
            columns: ["assigned_guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_bookings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_bookings_price_variant_id_fkey"
            columns: ["price_variant_id"]
            isOneToOne: false
            referencedRelation: "tours_package_price_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_cancellations: {
        Row: {
          admin_notes: string | null
          booking_id: string
          id: string
          reason: string
          requested_at: string
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["cancellation_status"]
        }
        Insert: {
          admin_notes?: string | null
          booking_id: string
          id?: string
          reason: string
          requested_at?: string
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["cancellation_status"]
        }
        Update: {
          admin_notes?: string | null
          booking_id?: string
          id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["cancellation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "tours_cancellations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_cancellations_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_checkins: {
        Row: {
          booking_id: string
          checked_in_by: string
          guide_id: string | null
          id: string
          method: string
          participant_id: string | null
          scanned_at: string
        }
        Insert: {
          booking_id: string
          checked_in_by: string
          guide_id?: string | null
          id?: string
          method: string
          participant_id?: string | null
          scanned_at?: string
        }
        Update: {
          booking_id?: string
          checked_in_by?: string
          guide_id?: string | null
          id?: string
          method?: string
          participant_id?: string | null
          scanned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_checkins_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_checkins_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_checkins_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "tours_booking_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "tours_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_conversation_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          guide_id: string | null
          id: string
          kind: string
          last_message_at: string
          operator_id: string | null
          tourist_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          guide_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          operator_id?: string | null
          tourist_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          guide_id?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          operator_id?: string | null
          tourist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_conversations_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_conversations_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "tours_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_conversations_tourist_id_fkey"
            columns: ["tourist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_events: {
        Row: {
          attraction_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          image_url: string | null
          is_published: boolean
          organizer: string | null
          source: string | null
          starts_at: string
          title: string
          updated_at: string
          venue: string
        }
        Insert: {
          attraction_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          organizer?: string | null
          source?: string | null
          starts_at: string
          title: string
          updated_at?: string
          venue: string
        }
        Update: {
          attraction_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          organizer?: string | null
          source?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_events_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "tours_attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_fares: {
        Row: {
          board_place_id: string | null
          checked_on: string
          created_at: string
          fare_max: number | null
          fare_min: number | null
          fare_per: string
          from_name: string
          id: string
          is_active: boolean
          minutes_max: number | null
          minutes_min: number | null
          mode: string
          schedule_note: string | null
          source: string
          to_name: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          board_place_id?: string | null
          checked_on?: string
          created_at?: string
          fare_max?: number | null
          fare_min?: number | null
          fare_per?: string
          from_name: string
          id?: string
          is_active?: boolean
          minutes_max?: number | null
          minutes_min?: number | null
          mode: string
          schedule_note?: string | null
          source: string
          to_name: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          board_place_id?: string | null
          checked_on?: string
          created_at?: string
          fare_max?: number | null
          fare_min?: number | null
          fare_per?: string
          from_name?: string
          id?: string
          is_active?: boolean
          minutes_max?: number | null
          minutes_min?: number | null
          mode?: string
          schedule_note?: string | null
          source?: string
          to_name?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tours_fares_board_place_id_fkey"
            columns: ["board_place_id"]
            isOneToOne: false
            referencedRelation: "tours_guide_places"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_guide_availability: {
        Row: {
          available_date: string
          created_at: string
          guide_id: string
          id: string
          is_available: boolean
        }
        Insert: {
          available_date: string
          created_at?: string
          guide_id: string
          id?: string
          is_available?: boolean
        }
        Update: {
          available_date?: string
          created_at?: string
          guide_id?: string
          id?: string
          is_available?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tours_guide_availability_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_guide_places: {
        Row: {
          address: string | null
          checked_on: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          latitude: number | null
          location_verified: boolean
          longitude: number | null
          municipality: string
          name: string
          opening_hours: Json | null
          phone: string | null
          price_max: number | null
          price_min: number | null
          price_unit: string | null
          slug: string
          source: string
          specialties: string[]
          tags: string[]
          updated_at: string
          verified: boolean
        }
        Insert: {
          address?: string | null
          checked_on?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          latitude?: number | null
          location_verified?: boolean
          longitude?: number | null
          municipality?: string
          name: string
          opening_hours?: Json | null
          phone?: string | null
          price_max?: number | null
          price_min?: number | null
          price_unit?: string | null
          slug: string
          source: string
          specialties?: string[]
          tags?: string[]
          updated_at?: string
          verified?: boolean
        }
        Update: {
          address?: string | null
          checked_on?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          latitude?: number | null
          location_verified?: boolean
          longitude?: number | null
          municipality?: string
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          price_max?: number | null
          price_min?: number | null
          price_unit?: string | null
          slug?: string
          source?: string
          specialties?: string[]
          tags?: string[]
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      tours_guide_sensitive_info: {
        Row: {
          created_at: string
          full_legal_name: string
          guide_id: string
          id_document_path: string
          id_number: string
          id_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_legal_name: string
          guide_id: string
          id_document_path: string
          id_number: string
          id_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_legal_name?: string
          guide_id?: string
          id_document_path?: string
          id_number?: string
          id_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_guide_sensitive_info_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: true
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_guide_swap_requests: {
        Row: {
          booking_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_guide_id: string
          id: string
          reason: string
          status: string
          to_guide_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_guide_id: string
          id?: string
          reason: string
          status?: string
          to_guide_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_guide_id?: string
          id?: string
          reason?: string
          status?: string
          to_guide_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_guide_swap_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_guide_swap_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_guide_swap_requests_from_guide_id_fkey"
            columns: ["from_guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_guide_swap_requests_to_guide_id_fkey"
            columns: ["to_guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_guides: {
        Row: {
          accreditation_notes: string | null
          accreditation_status: Database["public"]["Enums"]["accreditation_status"]
          bio: string | null
          consent_full_id_display: boolean
          consent_given_at: string | null
          contact_phone: string | null
          created_at: string
          id: string
          photo_url: string | null
          profile_id: string
          qr_code_value: string
          reviewed_at: string | null
          reviewed_by: string | null
          specialties: string[] | null
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          accreditation_notes?: string | null
          accreditation_status?: Database["public"]["Enums"]["accreditation_status"]
          bio?: string | null
          consent_full_id_display?: boolean
          consent_given_at?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          photo_url?: string | null
          profile_id: string
          qr_code_value?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialties?: string[] | null
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          accreditation_notes?: string | null
          accreditation_status?: Database["public"]["Enums"]["accreditation_status"]
          bio?: string | null
          consent_full_id_display?: boolean
          consent_given_at?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          photo_url?: string | null
          profile_id?: string
          qr_code_value?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          specialties?: string[] | null
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_guides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_guides_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_itineraries: {
        Row: {
          ai_prompt_used: string | null
          created_at: string
          end_date: string | null
          id: string
          plan_source: string
          preferences: Json | null
          share_token: string | null
          start_date: string | null
          summary: string | null
          title: string
          tourist_id: string
          updated_at: string
        }
        Insert: {
          ai_prompt_used?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          plan_source?: string
          preferences?: Json | null
          share_token?: string | null
          start_date?: string | null
          summary?: string | null
          title: string
          tourist_id: string
          updated_at?: string
        }
        Update: {
          ai_prompt_used?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          plan_source?: string
          preferences?: Json | null
          share_token?: string | null
          start_date?: string | null
          summary?: string | null
          title?: string
          tourist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_itineraries_tourist_id_fkey"
            columns: ["tourist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_itinerary_items: {
        Row: {
          attraction_id: string | null
          cost: number | null
          created_at: string
          day_number: number
          description: string | null
          end_time: string | null
          estimated_duration_minutes: number | null
          id: string
          item_kind: string
          item_order: number
          itinerary_id: string
          latitude: number | null
          linked_package_id: string | null
          location_name: string
          longitude: number | null
          start_time: string | null
          tip: string | null
          travel_minutes: number | null
        }
        Insert: {
          attraction_id?: string | null
          cost?: number | null
          created_at?: string
          day_number: number
          description?: string | null
          end_time?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          item_kind?: string
          item_order: number
          itinerary_id: string
          latitude?: number | null
          linked_package_id?: string | null
          location_name: string
          longitude?: number | null
          start_time?: string | null
          tip?: string | null
          travel_minutes?: number | null
        }
        Update: {
          attraction_id?: string | null
          cost?: number | null
          created_at?: string
          day_number?: number
          description?: string | null
          end_time?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          item_kind?: string
          item_order?: number
          itinerary_id?: string
          latitude?: number | null
          linked_package_id?: string | null
          location_name?: string
          longitude?: number | null
          start_time?: string | null
          tip?: string | null
          travel_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_itinerary_items_attraction_id_fkey"
            columns: ["attraction_id"]
            isOneToOne: false
            referencedRelation: "tours_attractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_itinerary_items_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "tours_itineraries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_itinerary_items_linked_package_id_fkey"
            columns: ["linked_package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_live_consents: {
        Row: {
          booking_id: string
          profile_id: string
          share_tour: boolean
          share_trip: boolean
          updated_at: string
        }
        Insert: {
          booking_id: string
          profile_id: string
          share_tour?: boolean
          share_trip?: boolean
          updated_at?: string
        }
        Update: {
          booking_id?: string
          profile_id?: string
          share_tour?: boolean
          share_trip?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_live_consents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_live_consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_live_flares: {
        Row: {
          accuracy_m: number | null
          booking_id: string
          created_at: string
          id: string
          lat: number
          lng: number
          profile_id: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          accuracy_m?: number | null
          booking_id: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          profile_id: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          accuracy_m?: number | null
          booking_id?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          profile_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_live_flares_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_live_flares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_live_flares_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_live_positions: {
        Row: {
          accuracy_m: number | null
          booking_id: string
          lat: number
          lng: number
          place_name: string | null
          precision: string
          profile_id: string
          role: string
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          booking_id: string
          lat: number
          lng: number
          place_name?: string | null
          precision: string
          profile_id: string
          role: string
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          booking_id?: string
          lat?: number
          lng?: number
          place_name?: string | null
          precision?: string
          profile_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_live_positions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_live_positions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_live_sessions: {
        Row: {
          booking_id: string
          ended_at: string | null
          guide_id: string
          started_at: string
          stops_reached: number
        }
        Insert: {
          booking_id: string
          ended_at?: string | null
          guide_id: string
          started_at?: string
          stops_reached?: number
        }
        Update: {
          booking_id?: string
          ended_at?: string | null
          guide_id?: string
          started_at?: string
          stops_reached?: number
        }
        Relationships: [
          {
            foreignKeyName: "tours_live_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_live_sessions_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_merchandise: {
        Row: {
          category: string
          contact_info: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          price: number | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          seller_name: string
          submitted_by_operator_id: string | null
          updated_at: string
          where_to_buy: string | null
        }
        Insert: {
          category?: string
          contact_info?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          price?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          seller_name: string
          submitted_by_operator_id?: string | null
          updated_at?: string
          where_to_buy?: string | null
        }
        Update: {
          category?: string
          contact_info?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          price?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          seller_name?: string
          submitted_by_operator_id?: string | null
          updated_at?: string
          where_to_buy?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_merchandise_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_merchandise_submitted_by_operator_id_fkey"
            columns: ["submitted_by_operator_id"]
            isOneToOne: false
            referencedRelation: "tours_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          message_id: string
          profile_id: string
          reaction: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          message_id: string
          profile_id?: string
          reaction: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          message_id?: string
          profile_id?: string
          reaction?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "tours_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "tours_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_messages: {
        Row: {
          attachment_url: string | null
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          message_text: string | null
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_text?: string | null
          reply_to_id?: string | null
          sender_id?: string
        }
        Update: {
          attachment_url?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message_text?: string | null
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "tours_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "tours_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          profile_id: string
          pushed_at: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          profile_id: string
          pushed_at?: string | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          profile_id?: string
          pushed_at?: string | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_operators: {
        Row: {
          accreditation_notes: string | null
          accreditation_status: Database["public"]["Enums"]["accreditation_status"]
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          business_address: string | null
          business_description: string | null
          business_name: string
          business_permit_url: string | null
          contact_email: string
          contact_person: string
          contact_phone: string
          created_at: string
          dti_registration_url: string | null
          gcash_name: string | null
          gcash_number: string | null
          gcash_qr_url: string | null
          id: string
          payment_instructions: string | null
          profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          accreditation_notes?: string | null
          accreditation_status?: Database["public"]["Enums"]["accreditation_status"]
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          business_address?: string | null
          business_description?: string | null
          business_name: string
          business_permit_url?: string | null
          contact_email: string
          contact_person: string
          contact_phone: string
          created_at?: string
          dti_registration_url?: string | null
          gcash_name?: string | null
          gcash_number?: string | null
          gcash_qr_url?: string | null
          id?: string
          payment_instructions?: string | null
          profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          accreditation_notes?: string | null
          accreditation_status?: Database["public"]["Enums"]["accreditation_status"]
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          business_address?: string | null
          business_description?: string | null
          business_name?: string
          business_permit_url?: string | null
          contact_email?: string
          contact_person?: string
          contact_phone?: string
          created_at?: string
          dti_registration_url?: string | null
          gcash_name?: string | null
          gcash_number?: string | null
          gcash_qr_url?: string | null
          id?: string
          payment_instructions?: string | null
          profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_operators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_operators_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_availability: {
        Row: {
          available_date: string
          capacity_booked: number
          capacity_total: number
          created_at: string
          id: string
          package_id: string
          updated_at: string
        }
        Insert: {
          available_date: string
          capacity_booked?: number
          capacity_total: number
          created_at?: string
          id?: string
          package_id: string
          updated_at?: string
        }
        Update: {
          available_date?: string
          capacity_booked?: number
          capacity_total?: number
          created_at?: string
          id?: string
          package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_package_availability_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_gallery: {
        Row: {
          caption: string | null
          created_at: string | null
          display_order: number
          id: string
          image_url: string
          package_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          image_url: string
          package_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          image_url?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_package_gallery_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_guides: {
        Row: {
          created_at: string
          guide_id: string
          id: string
          is_active: boolean
          package_id: string
        }
        Insert: {
          created_at?: string
          guide_id: string
          id?: string
          is_active?: boolean
          package_id: string
        }
        Update: {
          created_at?: string
          guide_id?: string
          id?: string
          is_active?: boolean
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_package_guides_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_package_guides_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_inclusions: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_included: boolean
          item_text: string
          package_id: string
        }
        Insert: {
          created_at?: string | null
          display_order: number
          id?: string
          is_included?: boolean
          item_text: string
          package_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_included?: boolean
          item_text?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_package_inclusions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_price_variants: {
        Row: {
          created_at: string
          flat_price: number | null
          id: string
          is_default: boolean
          max_pax: number | null
          min_pax: number
          package_id: string
          price_per_pax: number | null
          variant_name: string
        }
        Insert: {
          created_at?: string
          flat_price?: number | null
          id?: string
          is_default?: boolean
          max_pax?: number | null
          min_pax?: number
          package_id: string
          price_per_pax?: number | null
          variant_name: string
        }
        Update: {
          created_at?: string
          flat_price?: number | null
          id?: string
          is_default?: boolean
          max_pax?: number | null
          min_pax?: number
          package_id?: string
          price_per_pax?: number | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_package_price_variants_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_stops: {
        Row: {
          created_at: string
          description: string | null
          estimated_duration_minutes: number | null
          id: string
          latitude: number
          location_name: string
          longitude: number
          package_id: string
          stop_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          latitude: number
          location_name: string
          longitude: number
          package_id: string
          stop_order: number
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          latitude?: number
          location_name?: string
          longitude?: number
          package_id?: string
          stop_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tours_package_stops_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_packages: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          duration_type: Database["public"]["Enums"]["duration_type"]
          duration_value: number
          exclusions: string[] | null
          featured_image_url: string | null
          gallery_urls: string[] | null
          id: string
          inclusions: string[] | null
          location_name: string
          meeting_lat: number | null
          meeting_lng: number | null
          meeting_point_name: string | null
          meeting_time: string | null
          operator_id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["package_status"]
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_type?: Database["public"]["Enums"]["duration_type"]
          duration_value: number
          exclusions?: string[] | null
          featured_image_url?: string | null
          gallery_urls?: string[] | null
          id?: string
          inclusions?: string[] | null
          location_name: string
          meeting_lat?: number | null
          meeting_lng?: number | null
          meeting_point_name?: string | null
          meeting_time?: string | null
          operator_id: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["package_status"]
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_type?: Database["public"]["Enums"]["duration_type"]
          duration_value?: number
          exclusions?: string[] | null
          featured_image_url?: string | null
          gallery_urls?: string[] | null
          id?: string
          inclusions?: string[] | null
          location_name?: string
          meeting_lat?: number | null
          meeting_lng?: number | null
          meeting_point_name?: string | null
          meeting_time?: string | null
          operator_id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["package_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_packages_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "tours_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_payment_events: {
        Row: {
          booking_id: string | null
          event_id: string
          event_type: string
          livemode: boolean
          outcome: string | null
          payload: Json
          processed_at: string | null
          received_at: string
        }
        Insert: {
          booking_id?: string | null
          event_id: string
          event_type: string
          livemode?: boolean
          outcome?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          booking_id?: string | null
          event_id?: string
          event_type?: string
          livemode?: boolean
          outcome?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_payment_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_payment_proofs: {
        Row: {
          amount: number
          booking_id: string
          id: string
          payment_id: string | null
          payment_method: string
          proof_image_url: string
          reference_number: string
          rejection_reason: string | null
          submitted_at: string
          submitted_by: string | null
          verification_status: Database["public"]["Enums"]["payment_verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          id?: string
          payment_id?: string | null
          payment_method?: string
          proof_image_url: string
          reference_number: string
          rejection_reason?: string | null
          submitted_at?: string
          submitted_by?: string | null
          verification_status?: Database["public"]["Enums"]["payment_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          id?: string
          payment_id?: string | null
          payment_method?: string
          proof_image_url?: string
          reference_number?: string
          rejection_reason?: string | null
          submitted_at?: string
          submitted_by?: string | null
          verification_status?: Database["public"]["Enums"]["payment_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_payment_proofs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_payment_proofs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "tours_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_payment_proofs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_payment_proofs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string | null
          payment_method: string
          payment_status: string
          provider: string
          provider_method: string | null
          provider_ref: string | null
          raw_event: Json | null
          receipt_image_url: string | null
          recorded_by: string | null
          reference_number: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method: string
          payment_status?: string
          provider?: string
          provider_method?: string | null
          provider_ref?: string | null
          raw_event?: Json | null
          receipt_image_url?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          provider?: string
          provider_method?: string | null
          provider_ref?: string | null
          raw_event?: Json | null
          receipt_image_url?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_qr_scan_logs: {
        Row: {
          guide_id: string
          id: string
          revealed_at: string | null
          revealed_full_id: boolean
          scanned_at: string
          scanned_by: string
        }
        Insert: {
          guide_id: string
          id?: string
          revealed_at?: string | null
          revealed_full_id?: boolean
          scanned_at?: string
          scanned_by: string
        }
        Update: {
          guide_id?: string
          id?: string
          revealed_at?: string | null
          revealed_full_id?: boolean
          scanned_at?: string
          scanned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_qr_scan_logs_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_qr_scan_logs_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          guide_id: string | null
          hidden_reason: string | null
          id: string
          is_hidden: boolean
          operator_id: string
          operator_reply: string | null
          package_id: string
          photos: string[] | null
          rating: number
          replied_at: string | null
          tourist_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          guide_id?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          operator_id: string
          operator_reply?: string | null
          package_id: string
          photos?: string[] | null
          rating: number
          replied_at?: string | null
          tourist_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          guide_id?: string | null
          hidden_reason?: string | null
          id?: string
          is_hidden?: boolean
          operator_id?: string
          operator_reply?: string | null
          package_id?: string
          photos?: string[] | null
          rating?: number
          replied_at?: string | null
          tourist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "tours_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_reviews_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_reviews_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "tours_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_reviews_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_reviews_tourist_id_fkey"
            columns: ["tourist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_route_cache: {
        Row: {
          dest_key: string
          distance_m: number
          duration_s: number
          fetched_at: string
          mode: string
          origin_key: string
          polyline: string | null
        }
        Insert: {
          dest_key: string
          distance_m: number
          duration_s: number
          fetched_at?: string
          mode: string
          origin_key: string
          polyline?: string | null
        }
        Update: {
          dest_key?: string
          distance_m?: number
          duration_s?: number
          fetched_at?: string
          mode?: string
          origin_key?: string
          polyline?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      rewards_balances: {
        Row: {
          balance: number | null
          earned: number | null
          entries: number | null
          profile_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rewards_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_guide_ratings: {
        Row: {
          average_rating: number | null
          guide_id: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_reviews_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tours_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_operator_ratings: {
        Row: {
          average_rating: number | null
          operator_id: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_reviews_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "tours_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_package_ratings: {
        Row: {
          average_rating: number | null
          package_id: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_reviews_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "tours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      concurrency_check: {
        Args: { p_cached_updated_at: string; p_package_id: string }
        Returns: {
          current_updated_at: string
          has_conflict: boolean
        }[]
      }
      generate_booking_reference: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      replace_package_price_variants: {
        Args: { p_package_id: string; p_variants: Json }
        Returns: undefined
      }
      replace_package_price_variants_unchecked: {
        Args: { p_package_id: string; p_variants: Json }
        Returns: undefined
      }
      replace_package_stops: {
        Args: { p_package_id: string; p_stops: Json }
        Returns: undefined
      }
      replace_package_stops_unchecked: {
        Args: { p_package_id: string; p_stops: Json }
        Returns: undefined
      }
      rewards_add_points: {
        Args: {
          p_description?: string
          p_points: number
          p_profile_id: string
          p_ref_id: string
          p_source: string
        }
        Returns: boolean
      }
      submit_package_for_review: {
        Args: { p_package_id: string }
        Returns: undefined
      }
      tours_admin_analytics: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      tours_accreditation_counts: {
        Args: never
        Returns: {
          guides: number
          operators: number
        }[]
      }
      tours_badge_lookup: {
        Args: { p_guide_id: string }
        Returns: {
          approved_at: string
          full_name: string
          photo_url: string
          status: string
        }[]
      }
      tours_booking_context: {
        Args: { p_booking_id: string }
        Returns: {
          guide_profile: string
          operator_profile: string
          reference: string
          title: string
          tour_day: string
          tourist: string
        }[]
      }
      tours_cancel_guide_swap: {
        Args: { p_request: string }
        Returns: undefined
      }
      tours_chat_inbox: {
        Args: never
        Returns: {
          booking_id: string
          conversation_id: string
          kind: string
          last_message: string
          last_message_at: string
          last_sender_id: string
          subtitle: string
          title: string
          unread: number
        }[]
      }
      tours_check_in: {
        Args: {
          p_booking_id: string
          p_method: string
          p_participant_id: string
        }
        Returns: string
      }
      tours_conversation_header: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      tours_conversation_read_marks: {
        Args: { p_conversation_id: string }
        Returns: {
          last_read_at: string
          profile_id: string
        }[]
      }
      tours_count_booked_seats: {
        Args: { p_date: string; p_package_id: string }
        Returns: number
      }
      tours_decide_guide_swap: {
        Args: {
          p_approve: boolean
          p_guide?: string
          p_note?: string
          p_request: string
        }
        Returns: undefined
      }
      tours_guide_busy_reason: {
        Args: { p_date: string; p_exclude_booking?: string; p_guide: string }
        Returns: string
      }
      tours_guide_is_free: {
        Args: { p_date: string; p_exclude_booking?: string; p_guide: string }
        Returns: boolean
      }
      tours_guides_free_on: {
        Args: { p_date: string; p_exclude_booking?: string }
        Returns: {
          full_name: string
          guide_id: string
          reason: string
        }[]
      }
      tours_inbox: {
        Args: never
        Returns: {
          booking_id: string
          booking_reference: string
          conversation_id: string
          last_message: string
          last_message_at: string
          last_sender_id: string
          package_title: string
          tour_date: string
          tourist_name: string
          unread: number
        }[]
      }
      tours_is_booking_guide: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      tours_is_booking_operator: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      tours_is_booking_tourist: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      tours_is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      tours_is_my_operator: {
        Args: { p_operator_id: string }
        Returns: boolean
      }
      tours_live_can_watch: { Args: { p_booking_id: string }; Returns: boolean }
      tours_live_distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      tours_live_end: { Args: { p_booking_id: string }; Returns: undefined }
      tours_live_expire: { Args: { p_booking_id: string }; Returns: boolean }
      tours_live_flare: {
        Args: {
          p_accuracy_m?: number
          p_booking_id: string
          p_lat: number
          p_lng: number
        }
        Returns: {
          accuracy_m: number | null
          booking_id: string
          created_at: string
          id: string
          lat: number
          lng: number
          profile_id: string
          resolved_at: string | null
          resolved_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tours_live_flares"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tours_live_ping: {
        Args: {
          p_accuracy_m?: number
          p_booking_id: string
          p_lat: number
          p_lng: number
        }
        Returns: Json
      }
      tours_live_reach_stop: {
        Args: { p_booking_id: string; p_stops_reached: number }
        Returns: {
          booking_id: string
          ended_at: string | null
          guide_id: string
          started_at: string
          stops_reached: number
        }
        SetofOptions: {
          from: "*"
          to: "tours_live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tours_live_resolve_flare: {
        Args: { p_flare_id: string }
        Returns: undefined
      }
      tours_live_session_active: {
        Args: { p_booking_id: string }
        Returns: boolean
      }
      tours_live_set_consent: {
        Args: {
          p_booking_id: string
          p_share_tour: boolean
          p_share_trip: boolean
        }
        Returns: {
          booking_id: string
          profile_id: string
          share_tour: boolean
          share_trip: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tours_live_consents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tours_live_snap_town: {
        Args: { p_lat: number; p_lng: number }
        Returns: Record<string, unknown>
      }
      tours_live_start: {
        Args: { p_booking_id: string }
        Returns: {
          booking_id: string
          ended_at: string | null
          guide_id: string
          started_at: string
          stops_reached: number
        }
        SetofOptions: {
          from: "*"
          to: "tours_live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tours_live_sweep: { Args: never; Returns: undefined }
      tours_live_window: {
        Args: { p_booking_id: string }
        Returns: Record<string, unknown>
      }
      tours_mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      tours_my_approved_operator_id: { Args: never; Returns: string }
      tours_notify: {
        Args: {
          p_body: string
          p_link: string
          p_profile_id: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      tours_open_booking_conversation: {
        Args: { p_booking_id: string }
        Returns: string
      }
      tours_open_guide_tourist_conversation: {
        Args: { p_booking_id: string }
        Returns: string
      }
      tours_open_operator_admin_conversation: {
        Args: { p_operator_id?: string }
        Returns: string
      }
      tours_open_operator_guide_conversation: {
        Args: { p_guide_id?: string; p_operator_id?: string }
        Returns: string
      }
      tours_open_tourist_office_conversation: {
        Args: { p_tourist_id?: string }
        Returns: string
      }
      tours_peso: { Args: { p_amount: number }; Returns: string }
      tours_realtime_conversation_allowed: {
        Args: { p_topic: string }
        Returns: boolean
      }
      tours_realtime_live_allowed: {
        Args: { p_topic: string }
        Returns: boolean
      }
      tours_record_refund: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_method: string
          p_reference: string
        }
        Returns: number
      }
      tours_refundable_amount: {
        Args: { p_booking_id: string }
        Returns: number
      }
      tours_reply_to_review: {
        Args: { p_reply: string; p_review_id: string }
        Returns: undefined
      }
      tours_request_cancellation: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: string
      }
      tours_request_guide_swap: {
        Args: { p_booking: string; p_reason: string; p_to_guide: string }
        Returns: string
      }
      tours_resolve_cancellation: {
        Args: { p_approve: boolean; p_cancellation_id: string; p_notes: string }
        Returns: string
      }
      tours_set_meeting_point: {
        Args: {
          p_lat: number
          p_lng: number
          p_name: string
          p_package_id: string
          p_time: string
        }
        Returns: undefined
      }
      tours_set_review_hidden: {
        Args: { p_hidden: boolean; p_reason: string; p_review_id: string }
        Returns: undefined
      }
      tours_shared_itinerary: { Args: { p_token: string }; Returns: Json }
      tours_submit_review: {
        Args: { p_booking_id: string; p_comment: string; p_rating: number }
        Returns: string
      }
      update_package_and_relations: {
        Args: {
          p_expected_updated_at?: string
          p_gallery: Json
          p_inclusions: Json
          p_package_data: Json
          p_package_id: string
          p_price_variants: Json
          p_stops: Json
          p_submit_for_review?: boolean
        }
        Returns: {
          new_status: string
          new_updated_at: string
          success: boolean
        }[]
      }
    }
    Enums: {
      accreditation_status: "pending" | "approved" | "rejected" | "suspended"
      booking_status:
        | "pending_payment"
        | "payment_submitted"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "refund_requested"
        | "refund_confirmed"
      cancellation_status:
        | "requested"
        | "approved"
        | "rejected"
        | "refund_confirmed"
      duration_type: "hours" | "days"
      package_status:
        | "draft"
        | "pending_review"
        | "published"
        | "rejected"
        | "archived"
      payment_verification_status: "pending" | "verified" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      accreditation_status: ["pending", "approved", "rejected", "suspended"],
      booking_status: [
        "pending_payment",
        "payment_submitted",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "refund_requested",
        "refund_confirmed",
      ],
      cancellation_status: [
        "requested",
        "approved",
        "rejected",
        "refund_confirmed",
      ],
      duration_type: ["hours", "days"],
      package_status: [
        "draft",
        "pending_review",
        "published",
        "rejected",
        "archived",
      ],
      payment_verification_status: ["pending", "verified", "rejected"],
    },
  },
} as const
