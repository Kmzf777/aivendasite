import type { Metadata } from 'next'
import Erros from '@/components/Erros'

export const metadata: Metadata = {
  title: 'Erros · CRM Agrozet',
}

// Tela de admin, de diagnóstico. A tabela `operational_errors` só é escrita pelo
// servidor e lida por admin via RLS.
export default function ErrosPage() {
  return <Erros />
}
