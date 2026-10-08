import type { Metadata } from 'next'
import Clientes from '@/components/Clientes'

export const metadata: Metadata = {
  title: 'Clientes · CRM Agrozet',
}

// A tela é inteira client-side: lê o cadastro do store em memória por
// `useSyncExternalStore` e escreve de volta na edição da ficha. Pré-renderizar
// no servidor daria a mesma casca, então a página só monta o componente.
export default function ClientesPage() {
  return <Clientes />
}
