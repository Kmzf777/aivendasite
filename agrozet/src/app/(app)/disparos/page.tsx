import type { Metadata } from 'next'
import Disparos from '@/components/Disparos'

export const metadata: Metadata = {
  title: 'Disparos · CRM Agrozet',
}

// A tela é inteira client-side: a fila e o cancelamento vivem no estado do
// componente, então a página só monta o componente.
export default function DisparosPage() {
  return <Disparos />
}
