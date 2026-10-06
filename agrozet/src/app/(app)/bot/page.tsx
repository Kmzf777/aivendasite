import type { Metadata } from 'next'
import BotAdmin from '@/components/BotAdmin'

export const metadata: Metadata = {
  title: 'Bot · CRM Agrozet',
}

// Tela de admin. A autorização de verdade é a da Sidebar (`useIsAdmin`) mais a
// RLS do banco; aqui não há checagem própria porque `bot_config` não é lido do
// Supabase nesta rota.
export default function BotPage() {
  return <BotAdmin />
}
