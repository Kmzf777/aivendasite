import type { Metadata } from 'next'
import BotAdmin from '@/components/BotAdmin'

export const metadata: Metadata = {
  title: 'Bot · CRM Agrozet',
}

// Tela de admin. A autorização de verdade é a da Sidebar (`useIsAdmin`) mais a
// RLS do banco; aqui não há checagem própria porque nesta rota o mockup roda com
// login desativado e `bot_config` não é lido do Supabase.
export default function BotPage() {
  return <BotAdmin />
}
