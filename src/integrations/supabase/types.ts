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
      friendships: {
        Row: {
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: { blocked_id: string; blocker_id: string; created_at: string; id: string }
        Insert: { blocked_id: string; blocker_id: string; created_at?: string; id?: string }
        Update: { blocked_id?: string; blocker_id?: string; created_at?: string; id?: string }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      memories: {
        Row: {
          artist: string
          created_at: string
          date: string
          description: string | null
          id: string
          image_url: string | null
          image_urls: string[]
          image_focus_points: Json
          is_public: boolean
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          location_place_id: string | null
          memory_season: string | null
          memory_year: number | null
          mood: string
          people: string[]
          song_title: string
          tags: string[]
          title: string
          user_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[]
          image_focus_points?: Json
          is_public?: boolean
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_place_id?: string | null
          memory_season?: string | null
          memory_year?: number | null
          mood: string
          people?: string[]
          song_title: string
          tags?: string[]
          title: string
          user_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[]
          image_focus_points?: Json
          is_public?: boolean
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          location_place_id?: string | null
          memory_season?: string | null
          memory_year?: number | null
          mood?: string
          people?: string[]
          song_title?: string
          tags?: string[]
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_likes: {
        Row: {
          created_at: string
          id: string
          memory_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memory_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memory_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memory_likes_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          memory_id: string | null
          read_at: string | null
          source_id: string
          source_table: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          memory_id?: string | null
          read_at?: string | null
          source_id: string
          source_table: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          memory_id?: string | null
          read_at?: string | null
          source_id?: string
          source_table?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_songs: {
        Row: {
          artist: string
          created_at: string
          id: string
          memory_id: string | null
          song_title: string
          user_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          id?: string
          memory_id?: string | null
          song_title: string
          user_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          id?: string
          memory_id?: string | null
          song_title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_songs_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_request: {
        Args: { request_id: string }
        Returns: Database["public"]["Tables"]["friendships"]["Row"]
      }
      get_memory_access_info: {
        Args: { target_memory_id: string }
        Returns: {
          owner_id: string
          owner_username: string | null
          owner_display_name: string | null
          owner_avatar_url: string | null
          friendship_id: string | null
          friendship_status: string
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
