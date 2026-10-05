import type { Metadata } from 'next'
import Conversations from '@/components/Conversations'

export const metadata: Metadata = {
  title: 'Conversas · CRM Agrozet',
}

// A tela é inteira client-side: lista, timeline e composer vivem de polling do
// Supabase pelo cliente do browser (ver `useConversas`). Pré-renderizar no
// servidor daria uma casca vazia e duplicaria a consulta.
export default function ConversasPage() {
  return <Conversations />
}
