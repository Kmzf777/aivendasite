// =====================================================================
// ARQUIVO ESCRITO À MÃO — PROVISÓRIO
// =====================================================================
// No momento da escrita NÃO EXISTE projeto Supabase (sem project ref, sem
// credenciais), então `supabase gen types` era impossível. Este arquivo foi
// transcrito coluna por coluna de
// `supabase/migrations/20261005000000_baseline_agrozet.sql`, imitando a forma
// que o CLI gera (mesmo shape de `Database`, `Row`/`Insert`/`Update`,
// `Relationships`, helpers `Tables`/`TablesInsert`/`TablesUpdate`), para que a
// substituição pela geração real seja indolor.
//
// REGENERAR assim que o projeto Supabase existir, e DEPOIS DE QUALQUER DDL:
//
//   npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
//
// Enquanto isso não acontecer, estes tipos são uma AFIRMAÇÃO sobre o banco,
// não um fato: se a migration mudar e este arquivo não, o compilador continua
// aprovando escritas que o Postgres rejeita.
// =====================================================================

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      blocked_numbers: {
        Row: {
          created_at: string
          motivo: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          motivo?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          motivo?: string | null
          phone?: string
        }
        Relationships: []
      }
      bot_config: {
        Row: {
          ativo: boolean
          fecho: string
          id: number
          rodape: string | null
          saudacao: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          fecho: string
          id: number
          rodape?: string | null
          saudacao: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          fecho?: string
          id?: number
          rodape?: string | null
          saudacao?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_opcoes: {
        Row: {
          ativo: boolean
          botao_id: string
          id: string
          ordem: number
          resposta: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          botao_id: string
          id?: string
          ordem: number
          resposta: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          botao_id?: string
          id?: string
          ordem?: number
          resposta?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          bot_stage: string | null
          created_at: string
          id: string
          nome: string | null
          observacoes: string | null
          phone: string
          primeiro_contato_at: string | null
          ultima_interacao_at: string | null
          ultimo_servico: string | null
          updated_at: string
        }
        Insert: {
          bot_stage?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          observacoes?: string | null
          phone: string
          primeiro_contato_at?: string | null
          ultima_interacao_at?: string | null
          ultimo_servico?: string | null
          updated_at?: string
        }
        Update: {
          bot_stage?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          observacoes?: string | null
          phone?: string
          primeiro_contato_at?: string | null
          ultima_interacao_at?: string | null
          ultimo_servico?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          campaign_id: string | null
          content: string | null
          created_at: string
          delivery_status: string | null
          direction: string
          id: string
          media_mime: string | null
          media_path: string | null
          message_id: string
          message_type: string
          phone: string
        }
        Insert: {
          campaign_id?: string | null
          content?: string | null
          created_at?: string
          delivery_status?: string | null
          direction: string
          id?: string
          media_mime?: string | null
          media_path?: string | null
          message_id: string
          message_type: string
          phone: string
        }
        Update: {
          campaign_id?: string | null
          content?: string | null
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          media_mime?: string | null
          media_path?: string | null
          message_id?: string
          message_type?: string
          phone?: string
        }
        Relationships: []
      }
      operational_errors: {
        Row: {
          contexto: Json | null
          created_at: string
          id: string
          mensagem: string
          origem: string
        }
        Insert: {
          contexto?: Json | null
          created_at?: string
          id?: string
          mensagem: string
          origem: string
        }
        Update: {
          contexto?: Json | null
          created_at?: string
          id?: string
          mensagem?: string
          origem?: string
        }
        Relationships: []
      }
      pets: {
        Row: {
          cliente_id: string
          created_at: string
          especie: string | null
          id: string
          nome: string
          porte: string | null
          raca: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          especie?: string | null
          id?: string
          nome: string
          porte?: string | null
          raca?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          especie?: string | null
          id?: string
          nome?: string
          porte?: string | null
          raca?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_disparos: {
        Row: {
          attempts: number
          campaign_id: string | null
          cliente_id: string | null
          components: Json | null
          created_at: string
          error: string | null
          id: string
          message_id: string | null
          phone: string
          scheduled_for: string
          sent_at: string | null
          status: string
          template_lang: string
          template_name: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          cliente_id?: string | null
          components?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          message_id?: string | null
          phone: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          template_lang: string
          template_name: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          cliente_id?: string | null
          components?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          message_id?: string | null
          phone?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template_lang?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_disparos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // `set_updated_at` e `sync_cliente_from_message` NÃO entram aqui: são
      // funções de trigger (RETURNS trigger), não são chamáveis por RPC e o
      // CLI também não as geraria.
      is_admin: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const
