import type { Metadata } from 'next'
import Disparos from '@/components/Disparos'

export const metadata: Metadata = {
  title: 'Disparos · CRM Agrozet',
}

// MAQUETE: não existe `scheduled_disparos`, nem a rota que agenda, nem o cron
// que envia — é a Fase 3 inteira. A tela diz isso em cima, antes da tabela.
export default function DisparosPage() {
  return <Disparos />
}
