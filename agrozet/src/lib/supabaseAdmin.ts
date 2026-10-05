import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Cliente service_role (bypassa RLS). Fonte ÚNICA — não duplicar em rotas.
// Sem fallback para a anon key: env ausente vira erro explícito, e não uma
// escrita que falha muda sob RLS.
export function getAdminSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('[supabaseAdmin] NEXT_PUBLIC_SUPABASE_URL ausente')
  if (!key) throw new Error('[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY ausente')
  return createClient<Database>(url, key)
}
